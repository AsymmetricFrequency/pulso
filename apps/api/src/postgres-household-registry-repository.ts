import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { HouseholdRegistryRepository } from "@pulso/domain";
import type {
  CreateHouseholdRegistrationInput,
  HouseholdRegistrationReceipt,
  HouseholdRegistryStats,
} from "@pulso/schemas";
import type postgres from "postgres";
import { encryptField } from "./field-encryption.js";

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

    const [row] = await this.sql<{ public_code: string; created_at: Date }[]>`
      INSERT INTO household_self_registrations (
        id, incident_id, public_code, territory_id, neighborhood, location,
        people_count, children_count, older_adults_count,
        has_disability, has_pregnancy, has_chronic_illness,
        dwelling_status, sheltering_at, officially_censused,
        contact_name_encrypted, contact_phone_encrypted, document_encrypted, identity_fingerprint,
        consent_text_id, consented_at, source_ip_hash, client_mutation_id
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
        ${consent.id}, now(), ${context.sourceIpHash}, ${input.clientMutationId}
      )
      ON CONFLICT (incident_id, client_mutation_id) DO UPDATE SET updated_at = now()
      RETURNING public_code, created_at
    `;

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

  async stats(incidentId: string, incidentCode: string): Promise<HouseholdRegistryStats> {
    const [totals] = await this.sql<Record<string, unknown>[]>`
      SELECT
        count(*) AS households,
        coalesce(sum(people_count), 0) AS people,
        count(*) FILTER (WHERE officially_censused = 'no') AS uncensused_households,
        coalesce(sum(people_count) FILTER (WHERE officially_censused = 'no'), 0) AS people_uncensused,
        count(*) FILTER (WHERE sheltering_at = 'calle_o_carpa') AS sleeping_rough,
        count(*) FILTER (WHERE has_disability OR has_pregnancy OR has_chronic_illness)
          AS priority_condition
      FROM household_self_registrations
      WHERE incident_id = ${incidentId} AND status <> 'retirado'
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
  async stats(_incidentId: string, incidentCode: string): Promise<HouseholdRegistryStats> {
    return {
      incidentCode,
      households: 0,
      people: 0,
      uncensusedHouseholds: 0,
      peopleInUncensused: 0,
      sleepingRough: 0,
      withPriorityCondition: 0,
      byTerritory: [],
      generatedAt: new Date(0).toISOString(),
    };
  }
}
