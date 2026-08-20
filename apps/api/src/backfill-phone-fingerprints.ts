import { createHmac } from "node:crypto";
import postgres from "postgres";
import { decryptField } from "./field-encryption.js";
import { normalizePhone } from "./postgres-household-registry-repository.js";

/**
 * Calcula la huella del teléfono de los registros que ya estaban guardados.
 *
 * La columna `phone_fingerprint` se llena al registrar, así que los hogares que llegaron **antes**
 * de la migración 072 no la tienen — y sin ella el emparejador es ciego justo sobre los registros
 * más viejos, que son los que llevan más tiempo pudiendo estar duplicados.
 *
 * ## Lo que este script hace con datos personales, dicho sin rodeos
 *
 * Descifra teléfonos. Es la única forma de derivar una huella de algo que está cifrado con IV
 * aleatorio. Tres reglas que el código cumple y no solo esta nota:
 *
 * · **Nunca imprime un teléfono.** Ni en un log, ni en un error, ni en el resumen final.
 * · **No escribe el número en ningún lado**, solo el HMAC — que no se puede revertir sin el secreto.
 * · **Va por lotes y no carga la tabla entera**, para no tener miles de números en memoria a la vez.
 *
 * No escribe en `pii_access_log` y eso es deliberado: ese registro responde «¿qué persona miró los
 * datos de esta familia y para qué?», y aquí no hay ninguna persona mirando. Meter miles de filas
 * automáticas ahí enterraría los accesos reales, que son los que alguien va a querer auditar.
 *
 * Es idempotente: solo toca filas sin huella y con teléfono, así que correrlo dos veces no cambia
 * nada la segunda vez.
 */
export async function runBackfillPhoneFingerprints(options: {
  databaseUrl: string;
  fieldSecret: string;
  fingerprintSecret: string;
  batchSize?: number;
}): Promise<{ updated: number; unreadable: number }> {
  const sql = postgres(options.databaseUrl, { max: 1 });
  const batchSize = options.batchSize ?? 500;
  let updated = 0;
  let unreadable = 0;
  // Paginación por cursor y no por `WHERE phone_fingerprint IS NULL` a secas: una fila que no se
  // puede descifrar sigue sin huella después de intentarlo, así que la misma consulta la traería
  // otra vez y el bucle no terminaría nunca.
  let cursor: string | null = null;

  try {
    for (;;) {
      const rows: { id: string; incident_id: string; contact_phone_encrypted: Buffer }[] =
        await sql`
          SELECT id, incident_id, contact_phone_encrypted
          FROM household_self_registrations
          WHERE phone_fingerprint IS NULL
            AND contact_phone_encrypted IS NOT NULL
            AND redacted_at IS NULL
            ${cursor ? sql`AND id > ${cursor}::uuid` : sql``}
          ORDER BY id
          LIMIT ${batchSize}
        `;
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1]?.id ?? null;

      for (const row of rows) {
        let fingerprint: string | null = null;
        try {
          const phone = normalizePhone(
            decryptField(options.fieldSecret, Buffer.from(row.contact_phone_encrypted)),
          );
          // Un teléfono que quedó en nada al normalizar no produce huella: emparejar por una cadena
          // vacía metería en el mismo saco a todos los registros con el campo mal escrito.
          if (phone.length >= 7) {
            fingerprint = createHmac("sha256", options.fingerprintSecret)
              .update(`${row.incident_id}:tel:${phone}`)
              .digest("hex");
          }
        } catch {
          // Cifrado con otra clave, o corrupto. Se cuenta y se sigue: no poder leer un teléfono no
          // es motivo para dejar sin huella a los otros mil.
          unreadable += 1;
        }

        if (fingerprint) {
          await sql`
            UPDATE household_self_registrations
            SET phone_fingerprint = ${fingerprint}
            WHERE id = ${row.id} AND phone_fingerprint IS NULL AND redacted_at IS NULL
          `;
          updated += 1;
        }
      }
    }

    return { updated, unreadable };
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("backfill-phone-fingerprints.ts")) {
  const databaseUrl = process.env.DATABASE_URL;
  const fieldSecret = process.env.PII_ENCRYPTION_KEY;
  const fingerprintSecret = process.env.IDENTITY_FINGERPRINT_SECRET;
  if (!databaseUrl || !fieldSecret || !fingerprintSecret) {
    console.error(
      "Faltan DATABASE_URL, PII_ENCRYPTION_KEY o IDENTITY_FINGERPRINT_SECRET. " +
        "Sin la clave correcta las huellas saldrían mal y el emparejador quedaría ciego.",
    );
    process.exit(1);
  }
  runBackfillPhoneFingerprints({ databaseUrl, fieldSecret, fingerprintSecret })
    .then((result) => {
      console.log(
        `Huellas de teléfono calculadas: ${result.updated}. ` +
          `Sin poder descifrar: ${result.unreadable}.`,
      );
    })
    .catch((error) => {
      console.error("El relleno de huellas falló:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
