import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { HouseholdRegistryRepository } from "@pulso/domain";
import type {
  CreateHouseholdRegistrationInput,
  CreateRegistrationEvidenceInput,
  HouseholdRegistrationReceipt,
  HouseholdRegistryStats,
  RegistrationQueueItem,
  ReviewRegistrationInput,
} from "@pulso/schemas";
import type postgres from "postgres";
import { encryptField } from "./field-encryption.js";
import { stripImageMetadata } from "./strip-image-metadata.js";

type Sql = ReturnType<typeof postgres>;

/**
 * Alfabeto sin las letras que se confunden al dictarlas por teléfono o al leerlas de una pantalla
 * rayada: sin I, sin L, sin O, sin 0, sin 1. Este código es lo único que la persona se lleva, y lo
 * va a leer en voz alta o copiar a mano.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function publicCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += ALPHABET[(bytes[index] as number) % ALPHABET.length];
    if (index === 3) code += "-";
  }
  return code;
}

export class PostgresHouseholdRegistryRepository implements HouseholdRegistryRepository {
  constructor(
    private readonly sql: Sql,
    private readonly secrets: { fieldSecret: string; fingerprintSecret: string },
  ) {}

  async register(
    incidentId: string,
    input: CreateHouseholdRegistrationInput,
    context: { sourceIpHash: string | null },
  ): Promise<HouseholdRegistrationReceipt> {
    const [consent] = await this.sql<{ id: string }[]>`
      SELECT id FROM consent_texts
      WHERE slug = 'censo-comunitario' AND version = ${input.consentVersion}
      LIMIT 1
    `;
    // Sin el texto de consentimiento no se inserta nada. Que la versión no exista significa que el
    // formulario mostró un texto que no está en la base, y guardar el registro dejaría una fila
    // sin poder demostrar a qué consintió esa persona.
    if (!consent) {
      throw new Error(`Unknown consent version: ${input.consentVersion}`);
    }

    const code = publicCode();
    const fingerprint = input.document
      ? createHmac("sha256", this.secrets.fingerprintSecret)
          .update(`${incidentId}:${input.document.replace(/\D/g, "")}`)
          .digest("hex")
      : null;

    const territoryId = input.territoryCode
      ? ((
          await this.sql<{ id: string }[]>`
            SELECT id FROM territories
            WHERE incident_id = ${incidentId} AND territory_type = 'municipality'
              AND external_code = ${input.territoryCode} AND deleted_at IS NULL
            LIMIT 1
          `
        )[0]?.id ?? null)
      : null;

    const [row] = await this.sql<{ id: string; public_code: string; created_at: Date }[]>`
      INSERT INTO household_self_registrations (
        id, incident_id, public_code, territory_id, neighborhood, location,
        people_count, children_count, older_adults_count,
        has_disability, has_pregnancy, has_chronic_illness,
        dwelling_status, sheltering_at, officially_censused,
        contact_name_encrypted, contact_phone_encrypted, document_encrypted, identity_fingerprint,
        consent_text_id, consented_at, source_ip_hash, client_mutation_id,
        consent_purposes, sensitive_data_authorized
      ) VALUES (
        ${randomUUID()}, ${incidentId}, ${code}, ${territoryId}, ${input.neighborhood},
        ${
          input.location
            ? this
                .sql`ST_SetSRID(ST_MakePoint(${input.location.coordinates[0]}, ${input.location.coordinates[1]}), 4326)`
            : null
        },
        ${input.peopleCount}, ${input.childrenCount}, ${input.olderAdultsCount},
        ${input.hasDisability}, ${input.hasPregnancy}, ${input.hasChronicIllness},
        ${input.dwellingStatus}, ${input.shelteringAt}, ${input.officiallyCensused},
        ${input.contactName ? encryptField(this.secrets.fieldSecret, input.contactName) : null},
        ${input.contactPhone ? encryptField(this.secrets.fieldSecret, input.contactPhone) : null},
        ${input.document ? encryptField(this.secrets.fieldSecret, input.document) : null},
        ${fingerprint},
        ${consent.id}, now(), ${context.sourceIpHash}, ${input.clientMutationId},
        ${input.consentPurposes}, ${input.sensitiveDataAuthorized}
      )
      ON CONFLICT (incident_id, client_mutation_id) DO UPDATE SET updated_at = now()
      RETURNING id, public_code, created_at
    `;

    // La validación se calcula **al guardar**, no en un trabajo nocturno.
    //
    // Una señal que llega horas después no sirve para nada de lo que existe: quien coordina mira la
    // lista de un municipio cuando va a mandar una brigada, no cuando el cron termine. Y va después
    // del INSERT y sin bloquear la respuesta — un fallo al calcular la señal no puede impedir que
    // el registro de una familia quede guardado, que sería el peor intercambio posible.
    if (row?.id) {
      void this.sql`SELECT pulso_validate_registration(${row.id}::uuid)`.catch(() => undefined);
    }

    return {
      publicCode: String(row?.public_code ?? code),
      createdAt:
        row?.created_at instanceof Date ? row.created_at.toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Borrado a petición de la persona.
   *
   * Vacía los campos personales y **conserva la fila con sus conteos**. Si se borrara entera, el
   * número de hogares afectados de un municipio bajaría porque alguien ejerció un derecho, y esa
   * cifra es la que se le lleva a una alcaldía. El agregado no es dato personal; el nombre sí.
   */
  async redact(incidentId: string, code: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE household_self_registrations SET
        contact_name_encrypted = NULL,
        contact_phone_encrypted = NULL,
        document_encrypted = NULL,
        identity_fingerprint = NULL,
        location = NULL,
        status = 'retirado',
        redacted_at = now(),
        updated_at = now()
      WHERE incident_id = ${incidentId} AND public_code = ${code} AND redacted_at IS NULL
      RETURNING id
    `;
    return rows.length > 0;
  }

  /**
   * Guarda una foto del daño.
   *
   * El código público es la credencial: quien lo tiene puede añadir evidencia a **su** registro y a
   * ningún otro. No hace falta cuenta, y por eso mismo no se puede subir a un registro ajeno sin
   * conocer un código de ocho caracteres aleatorios.
   *
   * Los metadatos se quitan **antes** de escribir. Si se hiciera después, existiría una ventana —
   * por corta que sea— en la que la coordenada exacta de la casa de alguien está en la base.
   */
  async addEvidence(
    incidentId: string,
    input: CreateRegistrationEvidenceInput,
  ): Promise<{ stored: boolean; stripped: boolean }> {
    const [registration] = await this.sql<{ id: string }[]>`
      SELECT id FROM household_self_registrations
      WHERE incident_id = ${incidentId}
        AND public_code = ${input.publicCode.trim().toUpperCase()}
        AND redacted_at IS NULL
      LIMIT 1
    `;
    if (!registration) return { stored: false, stripped: false };

    const raw = Buffer.from(input.dataBase64, "base64");
    if (raw.length < 4 || raw.length > 12 * 1024 * 1024) return { stored: false, stripped: false };

    const { data, stripped } = stripImageMetadata(raw, input.contentType);
    const contentHash = createHash("sha256").update(data).digest("hex");

    await this.sql`
      INSERT INTO registration_evidence (
        id, registration_id, kind, content, file_name, content_type, byte_size,
        content_hash, exif_stripped
      ) VALUES (
        ${randomUUID()}, ${registration.id}, 'foto_dano', ${data}, ${input.fileName},
        ${input.contentType}, ${data.length}, ${contentHash}, ${stripped}
      )
    `;
    return { stored: true, stripped };
  }

  /**
   * La cola de quien audita, ordenada por lo que de verdad decide a quién mirar primero.
   *
   * No es orden de llegada: primero lo que el cruce automático marcó para revisar, y dentro de eso
   * lo que tiene más personas. Un registro con señal `revisar` y ocho personas dentro pesa más que
   * uno coherente de una sola — y el orden de una cola es la política de la cola.
   */
  async queue(
    incidentId: string,
    query: { signal?: string; limit?: number } = {},
  ): Promise<RegistrationQueueItem[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT r.id, r.public_code, r.neighborhood, t.name AS territory_name, r.people_count,
             r.dwelling_status, r.sheltering_at, r.officially_censused, r.created_at,
             v.signal, v.checks,
             pulso_evidence_level(r.id) AS evidence_level,
             (SELECT count(*) FROM registration_evidence e
                WHERE e.registration_id = r.id AND e.redacted_at IS NULL) AS evidence_count,
             (r.contact_phone_encrypted IS NOT NULL) AS has_contact,
             (SELECT rr.outcome FROM registration_reviews rr
                WHERE rr.registration_id = r.id ORDER BY rr.created_at DESC LIMIT 1) AS reviewed
      FROM household_self_registrations r
      LEFT JOIN territories t ON t.id = r.territory_id
      LEFT JOIN registration_validations v ON v.registration_id = r.id
      WHERE r.incident_id = ${incidentId}
        AND r.redacted_at IS NULL
        AND r.status <> 'retirado'
        ${query.signal ? this.sql`AND v.signal = ${query.signal}` : this.sql``}
      ORDER BY
        CASE v.signal WHEN 'revisar' THEN 0 WHEN 'sin_contraste' THEN 1 ELSE 2 END,
        r.people_count DESC,
        r.created_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      registrationId: String(row.id),
      publicCode: String(row.public_code),
      neighborhood: (row.neighborhood as string | null) ?? null,
      territoryName: (row.territory_name as string | null) ?? null,
      peopleCount: Number(row.people_count ?? 0),
      dwellingStatus: row.dwelling_status as RegistrationQueueItem["dwellingStatus"],
      shelteringAt: row.sheltering_at as RegistrationQueueItem["shelteringAt"],
      officiallyCensused: row.officially_censused as RegistrationQueueItem["officiallyCensused"],
      signal: (row.signal as RegistrationQueueItem["signal"]) ?? null,
      checks: (row.checks as Record<string, unknown> | null) ?? null,
      evidenceLevel: row.evidence_level as RegistrationQueueItem["evidenceLevel"],
      evidenceCount: Number(row.evidence_count ?? 0),
      hasContact: row.has_contact === true,
      reviewedOutcome: (row.reviewed as string | null) ?? null,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : new Date(0).toISOString(),
    }));
  }

  /**
   * Devuelve una foto para que un auditor la mire, **y deja constancia en el mismo momento**.
   *
   * El registro de acceso se escribe en la misma transacción que la lectura, no después. Si fueran
   * dos pasos, un fallo entre ellos dejaría a alguien habiendo visto la casa de una familia sin que
   * quede rastro — y el rastro es la única razón por la que esta ruta puede existir.
   *
   * El propósito es obligatorio y viaja desde quien pide. «Porque sí» no cabe: el campo tiene largo
   * mínimo y quien audita tiene que escribir para qué está mirando.
   */
  async readEvidence(
    incidentId: string,
    evidenceId: string,
    context: { actorId: string; actorRole: string; purpose: string },
  ): Promise<{ content: Buffer; contentType: string; exifStripped: boolean } | null> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx<
        {
          id: string;
          registration_id: string;
          content: Buffer;
          content_type: string;
          exif_stripped: boolean;
        }[]
      >`
        SELECT e.id, e.registration_id, e.content, e.content_type, e.exif_stripped
        FROM registration_evidence e
        JOIN household_self_registrations r ON r.id = e.registration_id
        WHERE e.id = ${evidenceId}
          AND r.incident_id = ${incidentId}
          AND e.redacted_at IS NULL
          AND e.content IS NOT NULL
        LIMIT 1
      `;
      if (!row) return null;

      await tx`
        INSERT INTO pii_access_log (
          id, incident_id, subject_table, subject_id, actor_id, actor_role, fields, purpose
        ) VALUES (
          ${randomUUID()}, ${incidentId}, 'household_self_registrations',
          ${row.registration_id}, ${context.actorId}, ${context.actorRole},
          ARRAY['foto_dano'], ${context.purpose}
        )
      `;

      return {
        content: row.content,
        contentType: row.content_type,
        exifStripped: row.exif_stripped,
      };
    });
  }

  /** La decisión humana, firmada y motivada. */
  async review(
    incidentId: string,
    registrationId: string,
    reviewerActorId: string,
    input: ReviewRegistrationInput,
  ): Promise<boolean> {
    const [registration] = await this.sql<{ id: string }[]>`
      SELECT id FROM household_self_registrations
      WHERE id = ${registrationId} AND incident_id = ${incidentId} AND redacted_at IS NULL
      LIMIT 1
    `;
    if (!registration) return false;

    await this.sql`
      INSERT INTO registration_reviews (
        id, registration_id, outcome, reviewer_actor_id, rationale, evidence_kind
      ) VALUES (
        ${randomUUID()}, ${registrationId}, ${input.outcome}, ${reviewerActorId},
        ${input.rationale}, ${input.evidenceKind}
      )
    `;
    return true;
  }

  async stats(incidentId: string, incidentCode: string): Promise<HouseholdRegistryStats> {
    const [totals] = await this.sql<Record<string, unknown>[]>`
      SELECT
        count(*) AS households,
        coalesce(sum(r.people_count), 0) AS people,
        count(*) FILTER (WHERE r.officially_censused = 'no') AS uncensused_households,
        coalesce(sum(r.people_count) FILTER (WHERE r.officially_censused = 'no'), 0)
          AS people_uncensused,
        count(*) FILTER (WHERE r.sheltering_at = 'calle_o_carpa') AS sleeping_rough,
        count(*) FILTER (WHERE r.has_disability OR r.has_pregnancy OR r.has_chronic_illness)
          AS priority_condition,
        count(*) FILTER (WHERE v.signal = 'coherente') AS coherent,
        count(*) FILTER (WHERE v.signal = 'sin_contraste') AS uncontrasted,
        count(*) FILTER (WHERE v.signal = 'revisar') AS to_review,
        count(*) FILTER (WHERE rv.id IS NOT NULL) AS human_reviewed
      FROM household_self_registrations r
      LEFT JOIN registration_validations v ON v.registration_id = r.id
      LEFT JOIN LATERAL (
        SELECT id FROM registration_reviews rr
        WHERE rr.registration_id = r.id ORDER BY rr.created_at DESC LIMIT 1
      ) rv ON true
      WHERE r.incident_id = ${incidentId} AND r.status <> 'retirado'
    `;

    const byTerritory = await this.sql<Record<string, unknown>[]>`
      SELECT t.external_code, t.name,
             count(*) AS households,
             coalesce(sum(r.people_count), 0) AS people,
             count(*) FILTER (WHERE r.officially_censused = 'no') AS uncensused
      FROM household_self_registrations r
      LEFT JOIN territories t ON t.id = r.territory_id
      WHERE r.incident_id = ${incidentId} AND r.status <> 'retirado'
      GROUP BY t.external_code, t.name
      ORDER BY count(*) FILTER (WHERE r.officially_censused = 'no') DESC, count(*) DESC
      LIMIT 200
    `;

    const asNumber = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return {
      incidentCode,
      households: asNumber(totals?.households),
      people: asNumber(totals?.people),
      uncensusedHouseholds: asNumber(totals?.uncensused_households),
      peopleInUncensused: asNumber(totals?.people_uncensused),
      sleepingRough: asNumber(totals?.sleeping_rough),
      withPriorityCondition: asNumber(totals?.priority_condition),
      validation: {
        coherent: asNumber(totals?.coherent),
        uncontrasted: asNumber(totals?.uncontrasted),
        toReview: asNumber(totals?.to_review),
        humanReviewed: asNumber(totals?.human_reviewed),
      },
      byTerritory: byTerritory.map((row) => ({
        territoryCode: (row.external_code as string | null) ?? null,
        territoryName: (row.name as string | null) ?? null,
        households: asNumber(row.households),
        people: asNumber(row.people),
        uncensused: asNumber(row.uncensused),
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Sin Postgres no hay registro. Nunca datos de ejemplo: una cifra inventada aquí es una persona. */
export class EmptyHouseholdRegistryRepository implements HouseholdRegistryRepository {
  async register(): Promise<HouseholdRegistrationReceipt> {
    throw new Error("El registro comunitario necesita base de datos.");
  }
  async redact(): Promise<boolean> {
    return false;
  }
  async addEvidence(): Promise<{ stored: boolean; stripped: boolean }> {
    return { stored: false, stripped: false };
  }
  async queue(): Promise<RegistrationQueueItem[]> {
    return [];
  }
  async readEvidence(): Promise<null> {
    return null;
  }
  async review(): Promise<boolean> {
    return false;
  }
  async stats(_incidentId: string, incidentCode: string): Promise<HouseholdRegistryStats> {
    return {
      incidentCode,
      households: 0,
      people: 0,
      uncensusedHouseholds: 0,
      peopleInUncensused: 0,
      sleepingRough: 0,
      withPriorityCondition: 0,
      validation: { coherent: 0, uncontrasted: 0, toReview: 0, humanReviewed: 0 },
      byTerritory: [],
      generatedAt: new Date(0).toISOString(),
    };
  }
}
