import postgres from "postgres";

/**
 * Borra los datos personales de los registros del censo comunitario que superaron la retención.
 *
 * La Ley 1581 dice que los datos se conservan mientras sean necesarios para la finalidad que los
 * justificó. Aquí esa finalidad es concreta y **se agota**: decirle a una alcaldía que a este hogar
 * falta censarlo. Pasados noventa días, o esa información ya llegó y sirvió, o ya no va a servir —
 * y en los dos casos el nombre de la familia deja de tener razón de estar.
 *
 * **Corre solo.** Una política de retención que depende de que alguien se acuerde de ejecutarla no
 * es una política de retención, es una intención.
 *
 * Conserva los conteos: la cifra de hogares afectados de un municipio no puede bajar porque pasó
 * el tiempo. El agregado no es dato personal; el nombre sí.
 */
export async function runRedactExpiredRegistrations(options: {
  databaseUrl: string;
  retention?: string;
}): Promise<{ redacted: number }> {
  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const [row] = await sql<{ redacted: number }[]>`
      SELECT pulso_redact_expired_registrations(${options.retention ?? "90 days"}::interval)
        AS redacted
    `;
    return { redacted: Number(row?.redacted ?? 0) };
  } finally {
    await sql.end();
  }
}
