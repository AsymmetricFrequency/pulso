import type { PublicReportRepository } from "@pulso/domain";
import { type PublicSituationReportDto, publicSituationReportSchema } from "@pulso/schemas";
import type postgres from "postgres";

type DbRow = Record<string, unknown>;

export class PostgresPublicReportRepository implements PublicReportRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findPublishedByIncidentCode(
    incidentCode: string,
  ): Promise<PublicSituationReportDto | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT publication.snapshot
      FROM public_report_publications publication
      JOIN incidents incident ON incident.id = publication.incident_id
      WHERE incident.code = ${incidentCode}
        AND incident.deleted_at IS NULL
        AND publication.status IN ('published', 'corrected')
      ORDER BY publication.published_at DESC, publication.created_at DESC
      LIMIT 1
    `;
    if (!row) return undefined;
    const snapshot = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
    return publicSituationReportSchema.parse(snapshot);
  }
}
