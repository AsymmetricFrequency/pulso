import { createHash } from "node:crypto";
import {
  CommunityReportNotFoundError,
  CommunityReportRateLimitError,
  type CommunityReportRepository,
} from "@pulso/domain";
import type {
  CommunityReportDto,
  CreateCommunityReportInput,
  PublicCommunityReportDto,
  ReviewCommunityReportInput,
  UpsertExternalCommunityReportInput,
} from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

type DbRow = Record<string, unknown>;

const RATE_LIMIT_MAX_ATTEMPTS = 5;

const reportFromRow = (row: DbRow): CommunityReportDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  territoryId: row.territory_id ? String(row.territory_id) : null,
  reportType: row.report_type as CommunityReportDto["reportType"],
  category: (row.category as CommunityReportDto["category"]) ?? null,
  title: String(row.title),
  description: row.description ? String(row.description) : null,
  location: typeof row.location === "string" ? JSON.parse(row.location) : (row.location as never),
  status: row.status as CommunityReportDto["status"],
  contact: row.contact_encrypted ? "•••" : null,
  metadata: (row.metadata as CommunityReportDto["metadata"]) ?? null,
  externalSourceId: row.external_source_id ? String(row.external_source_id) : null,
  externalKey: row.external_key ? String(row.external_key) : null,
  reviewedByActorId: row.reviewed_by_actor_id ? String(row.reviewed_by_actor_id) : null,
  reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).toISOString() : null,
  reviewNotes: row.review_notes ? String(row.review_notes) : null,
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

const toPublic = (report: CommunityReportDto): PublicCommunityReportDto => ({
  id: report.id,
  reportType: report.reportType,
  category: report.category,
  title: report.title,
  description: report.description,
  location: report.location,
  status: report.status,
  externalSourceId: report.externalSourceId,
  metadata: report.metadata,
  createdAt: report.createdAt,
});

export class PostgresCommunityReportRepository implements CommunityReportRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async create(
    incidentId: string,
    input: CreateCommunityReportInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicCommunityReportDto> {
    if (context.sourceIpHash) await this.#consumeRateLimit(context.sourceIpHash);

    // contact_encrypted is intentionally left NULL here: there is no shared encryption
    // helper yet for bytea contact columns (see affected_people.contact_encrypted).
    // Wire this once that mechanism exists instead of hand-rolling a second one.
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        source_ip_hash, client_mutation_id
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${input.reportType}, ${input.category}, ${input.title},
        ${input.description},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.location)}), 4326),
        ${context.sourceIpHash}, ${input.clientMutationId}
      )
      ON CONFLICT (incident_id, client_mutation_id) DO UPDATE SET incident_id = EXCLUDED.incident_id
      RETURNING *, ST_AsGeoJSON(location)::json AS location
    `;
    if (!row) throw new Error("PostgreSQL did not return the created community report");
    return toPublic(reportFromRow(row));
  }

  async listPublicByIncident(incidentId: string): Promise<PublicCommunityReportDto[]> {
    // Capped: with tens of thousands of potential external + citizen points, an unbounded
    // list would overwhelm the SVG map. Prioritize corroborated/validated signal, then recency.
    const rows = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(location)::json AS location
      FROM community_reports
      WHERE incident_id = ${incidentId} AND status <> 'rejected'
      ORDER BY
        CASE status WHEN 'validated' THEN 0 WHEN 'corroborated' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT 800
    `;
    return rows.map(reportFromRow).map(toPublic);
  }

  async listByIncident(incidentId: string): Promise<CommunityReportDto[]> {
    const rows = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(location)::json AS location
      FROM community_reports
      WHERE incident_id = ${incidentId}
      ORDER BY created_at DESC
    `;
    return rows.map(reportFromRow);
  }

  async review(
    reportId: string,
    reviewerActorId: string,
    input: ReviewCommunityReportInput,
  ): Promise<CommunityReportDto> {
    const [row] = await this.sql<DbRow[]>`
      UPDATE community_reports
      SET status = ${input.status},
          reviewed_by_actor_id = ${reviewerActorId},
          reviewed_at = now(),
          review_notes = ${input.notes},
          updated_at = now()
      WHERE id = ${reportId}
      RETURNING *, ST_AsGeoJSON(location)::json AS location
    `;
    if (!row) throw new CommunityReportNotFoundError(reportId);
    return reportFromRow(row);
  }

  async upsertFromExternalSource(
    incidentId: string,
    input: UpsertExternalCommunityReportInput,
  ): Promise<CommunityReportDto> {
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        status, external_source_id, external_key, client_mutation_id, metadata
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${input.reportType}, ${input.category}, ${input.title},
        ${input.description},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.location)}), 4326),
        ${input.status}, ${input.externalSourceId}, ${input.externalKey}, ${uuidv7()},
        ${input.metadata ? this.sql.json(input.metadata) : null}
      )
      ON CONFLICT (external_source_id, external_key) WHERE external_source_id IS NOT NULL
      DO UPDATE SET
        report_type = EXCLUDED.report_type,
        category = EXCLUDED.category,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location = EXCLUDED.location,
        metadata = EXCLUDED.metadata,
        status = CASE WHEN community_reports.status = 'rejected' THEN community_reports.status
          ELSE EXCLUDED.status END,
        updated_at = now()
      RETURNING *, ST_AsGeoJSON(location)::json AS location
    `;
    if (!row) throw new Error("PostgreSQL did not return the upserted community report");
    return reportFromRow(row);
  }

  async #consumeRateLimit(sourceIpHash: string) {
    const key = createHash("sha256").update(`community-report:${sourceIpHash}`).digest("hex");
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO access_rate_limits (key_hash, attempts, reset_at)
      VALUES (${key}, 1, now() + interval '10 minutes')
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts = CASE WHEN access_rate_limits.reset_at <= now() THEN 1
          ELSE access_rate_limits.attempts + 1 END,
        reset_at = CASE WHEN access_rate_limits.reset_at <= now()
          THEN now() + interval '10 minutes' ELSE access_rate_limits.reset_at END
      RETURNING attempts, reset_at
    `;
    if (Number(row?.attempts) > RATE_LIMIT_MAX_ATTEMPTS) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(String(row?.reset_at)).getTime() - Date.now()) / 1_000),
      );
      throw new CommunityReportRateLimitError(retryAfter);
    }
  }
}
