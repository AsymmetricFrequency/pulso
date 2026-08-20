import type { DuplicateTrayRepository } from "@pulso/domain";
import type { DuplicateTray, ResolveDuplicateInput } from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const asIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value === null ? null : String(value);

const asCount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type TrayRow = {
  id: string;
  signals: string[];
  strength: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
  rationale: string | null;
  keep_registration_id: string | null;
  [key: string]: unknown;
};

const side = (row: TrayRow, prefix: "a" | "b") => ({
  registrationId: String(row[`${prefix}_id`]),
  publicCode: String(row[`${prefix}_code`]),
  neighborhood: (row[`${prefix}_neighborhood`] as string | null) ?? null,
  territoryName: (row[`${prefix}_territory`] as string | null) ?? null,
  peopleCount: asCount(row[`${prefix}_people`]),
  dwellingStatus: String(row[`${prefix}_dwelling`]),
  shelteringAt: String(row[`${prefix}_sheltering`]),
  officiallyCensused: String(row[`${prefix}_censused`]),
  hasContact: Boolean(row[`${prefix}_has_contact`]),
  createdAt: asIso(row[`${prefix}_created_at`]) ?? "",
});

/**
 * La bandeja de posibles duplicados.
 *
 * El emparejamiento y la resolución viven en funciones de la base (`pulso_match_registrations`,
 * `pulso_resolve_duplicate_candidate`) y no aquí. No es preferencia de estilo: resolver un par
 * escribe en tres tablas —la bandeja, el registro descartado y la constancia firmada— y esas tres
 * escrituras tienen que ocurrir juntas o ninguna. Repartidas entre este archivo y la base, un fallo
 * a mitad dejaría un hogar marcado como duplicado sin nadie que responda por esa decisión.
 */
export class PostgresDuplicateTrayRepository implements DuplicateTrayRepository {
  constructor(private readonly sql: Sql) {}

  async match(incidentId: string): Promise<number> {
    const [row] = await this.sql<{ matched: number }[]>`
      SELECT pulso_match_registrations(${incidentId}::uuid) AS matched
    `;
    return asCount(row?.matched);
  }

  async list(
    incidentId: string,
    query: { status?: string; strength?: string; limit?: number } = {},
  ): Promise<DuplicateTray> {
    const status = query.status ?? "propuesto";
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);

    const [rows, summary] = await Promise.all([
      this.sql<TrayRow[]>`
        SELECT * FROM registration_duplicate_tray
        WHERE incident_id = ${incidentId}
          AND status = ${status}
          ${query.strength ? this.sql`AND strength = ${query.strength}` : this.sql``}
        -- Los fuertes primero, y dentro de cada nivel los más viejos: un par que lleva días
        -- esperando es un hogar que puede estar contado dos veces en la lista que ya se entregó.
        ORDER BY strength = 'fuerte' DESC, created_at
        LIMIT ${limit}
      `,
      this.sql<
        {
          open: string;
          open_strong: string;
          confirmed: string;
          dismissed: string;
          registrations: string;
          last_matched_at: Date | null;
        }[]
      >`
        SELECT
          count(*) FILTER (WHERE c.status = 'propuesto')::text AS open,
          count(*) FILTER (WHERE c.status = 'propuesto' AND c.strength = 'fuerte')::text AS open_strong,
          count(*) FILTER (WHERE c.status = 'confirmado')::text AS confirmed,
          count(*) FILTER (WHERE c.status = 'descartado')::text AS dismissed,
          (SELECT count(*) FROM household_self_registrations r
            WHERE r.incident_id = ${incidentId}
              AND r.redacted_at IS NULL
              AND r.status NOT IN ('retirado', 'duplicado'))::text AS registrations,
          max(c.updated_at) AS last_matched_at
        FROM registration_duplicate_candidates c
        WHERE c.incident_id = ${incidentId}
      `,
    ]);

    const totals = summary[0];
    return {
      summary: {
        open: asCount(totals?.open),
        openStrong: asCount(totals?.open_strong),
        confirmed: asCount(totals?.confirmed),
        dismissed: asCount(totals?.dismissed),
        registrations: asCount(totals?.registrations),
        lastMatchedAt: asIso(totals?.last_matched_at ?? null),
      },
      candidates: rows.map((row) => ({
        id: row.id,
        signals: row.signals as DuplicateTray["candidates"][number]["signals"],
        strength: row.strength as DuplicateTray["candidates"][number]["strength"],
        status: row.status as DuplicateTray["candidates"][number]["status"],
        createdAt: asIso(row.created_at) ?? "",
        resolvedAt: asIso(row.resolved_at),
        rationale: row.rationale,
        keepRegistrationId: row.keep_registration_id,
        a: side(row, "a"),
        b: side(row, "b"),
      })),
    };
  }

  async resolve(
    incidentId: string,
    candidateId: string,
    actorId: string,
    input: ResolveDuplicateInput,
  ): Promise<boolean> {
    // El incidente se comprueba aquí y no dentro de la función: una sesión de otra emergencia no
    // puede resolver un par de esta, y esa es una regla de autorización, no de integridad.
    const [row] = await this.sql<{ resolved: boolean }[]>`
      SELECT pulso_resolve_duplicate_candidate(
        c.id, ${actorId}::uuid, ${input.decision}, ${input.keepRegistrationId ?? null}::uuid,
        ${input.rationale}
      ) AS resolved
      FROM registration_duplicate_candidates c
      WHERE c.id = ${candidateId} AND c.incident_id = ${incidentId}
    `;
    return Boolean(row?.resolved);
  }
}

/**
 * Sin base de datos no hay censo, así que no hay pares. Bandeja vacía y contadores en cero: una
 * pareja de ejemplo aquí le enseñaría a quien audita a resolver duplicados inventados.
 */
export class EmptyDuplicateTrayRepository implements DuplicateTrayRepository {
  async match(): Promise<number> {
    return 0;
  }

  async list(): Promise<DuplicateTray> {
    return {
      summary: {
        open: 0,
        openStrong: 0,
        confirmed: 0,
        dismissed: 0,
        registrations: 0,
        lastMatchedAt: null,
      },
      candidates: [],
    };
  }

  async resolve(): Promise<boolean> {
    return false;
  }
}
