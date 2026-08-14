import type postgres from "postgres";
import { z } from "zod";

const metricSchema = z
  .object({
    key: z.enum(["deaths", "injured", "collapsed_buildings", "missing", "rescued"]),
    value: z.number().int().nonnegative(),
    label: z.string().min(1).max(100),
    sourceUpdatedLabel: z.string().min(1).max(200),
  })
  .strip();

const servicePointSchema = z
  .object({
    externalKey: z.string().regex(/^[a-f0-9]{24}$/),
    type: z.enum(["collection_center", "shelter", "blood_donation"]),
    name: z.string().min(1).max(200),
    address: z.string().min(1).max(300).optional(),
    status: z.enum(["open", "closed", "unknown"]),
    mapUrl: z.string().url().startsWith("https://maps.app.goo.gl/").optional(),
    schedule: z.string().min(1).max(120).optional(),
  })
  .strip();

export type CaliPublicSourceSnapshot = {
  source: {
    id: "cali-official-earthquake-repository";
    name: string;
    url: string;
    authority: "official";
  };
  fetchedAt: string;
  metrics: Array<z.infer<typeof metricSchema>>;
  servicePoints: Array<z.infer<typeof servicePointSchema>>;
};

export interface CaliPublicSourceRepository {
  findSnapshot(): Promise<CaliPublicSourceSnapshot | undefined>;
}

export class EmptyCaliPublicSourceRepository implements CaliPublicSourceRepository {
  async findSnapshot() {
    return undefined;
  }
}

export class PostgresCaliPublicSourceRepository implements CaliPublicSourceRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findSnapshot(): Promise<CaliPublicSourceSnapshot | undefined> {
    const sourceId = "cali-official-earthquake-repository";
    const [source] = await this.sql<
      Array<{ display_name: string; source_url: string; last_seen_at: unknown }>
    >`
      SELECT s.display_name, s.source_url, max(r.last_seen_at) AS last_seen_at
      FROM external_sources s
      JOIN source_records r ON r.source_id = s.id AND r.active = true
      WHERE s.id = ${sourceId} AND s.active = true
        AND s.authority = 'official' AND s.data_classification = 'public_operational'
        AND r.record_type IN ('incident_metric', 'service_point')
      GROUP BY s.display_name, s.source_url
    `;
    if (!source) return undefined;
    const rows = await this.sql<Array<{ record_type: string; payload: unknown }>>`
      SELECT record_type, payload
      FROM source_records
      WHERE source_id = ${sourceId} AND active = true
        AND record_type IN ('incident_metric', 'service_point')
      ORDER BY record_type, external_key
    `;
    return {
      source: {
        id: sourceId,
        name: source.display_name,
        url: source.source_url,
        authority: "official",
      },
      fetchedAt:
        source.last_seen_at instanceof Date
          ? source.last_seen_at.toISOString()
          : new Date(String(source.last_seen_at)).toISOString(),
      metrics: rows
        .filter((row) => row.record_type === "incident_metric")
        .map((row) => metricSchema.parse(row.payload)),
      servicePoints: rows
        .filter((row) => row.record_type === "service_point")
        .map((row) => servicePointSchema.parse(row.payload)),
    };
  }
}
