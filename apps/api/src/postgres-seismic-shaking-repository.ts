import type { SeismicShakingRepository, TerritoryShakingQuery } from "@pulso/domain";
import type { TerritoryShakingDto } from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export class PostgresSeismicShakingRepository implements SeismicShakingRepository {
  constructor(private readonly sql: Sql) {}

  async listByIncident(
    incidentId: string,
    query: TerritoryShakingQuery = {},
  ): Promise<TerritoryShakingDto[]> {
    // Por omisión solo departamentos: son 33 y caben en una vista; los 1.121 municipios se piden
    // explícitamente cuando alguien está mirando un territorio concreto.
    const level = query.level ?? "department";
    const limit = Math.min(Math.max(query.limit ?? 1_200, 1), 2_000);

    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT t.external_code, t.name, t.territory_type,
             s.mmi_max, s.mmi_mean, s.mmi_label, s.grid_cells, s.source_id, s.computed_at
      FROM territory_shaking s
      JOIN territories t ON t.id = s.territory_id
      WHERE s.incident_id = ${incidentId}
        AND t.territory_type = ${level}
        AND t.deleted_at IS NULL
      ORDER BY s.mmi_max DESC, t.name
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      territoryCode: (row.external_code as string | null) ?? null,
      territoryName: String(row.name),
      territoryType: String(row.territory_type),
      mmiMax: Number(row.mmi_max),
      mmiMean: row.mmi_mean === null ? null : Number(row.mmi_mean),
      mmiLabel: String(row.mmi_label),
      gridCells: Number(row.grid_cells),
      sourceId: String(row.source_id),
      computedAt:
        row.computed_at instanceof Date ? row.computed_at.toISOString() : new Date(0).toISOString(),
    }));
  }
}

/** Sin Postgres no hay malla que cruzar: lista vacía, nunca datos de ejemplo. */
export class EmptySeismicShakingRepository implements SeismicShakingRepository {
  async listByIncident(): Promise<TerritoryShakingDto[]> {
    return [];
  }
}
