import type postgres from "postgres";
import { z } from "zod";

const eventSchema = z
  .object({
    id: z.string().regex(/^SGC[0-9A-Za-z]+$/),
    magnitude: z.number().min(-2).max(10),
    magnitudeType: z.string().min(1).max(30),
    depthKm: z.number().min(-10).max(1_000),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    localTime: z.string().min(10).max(30),
    utcTime: z.string().min(10).max(30),
    updatedAt: z.string().min(10).max(30),
    place: z.string().min(1).max(300),
    status: z.enum(["manual", "automatic", "unknown"]),
    agency: z.literal("SGC"),
    closerTowns: z.string().max(1_000),
    feltReports: z.number().nonnegative(),
    instrumentalIntensity: z.number().nonnegative(),
    communityIntensity: z.number().nonnegative(),
  })
  .strip();

export type SgcPublicSnapshot = {
  source: {
    id: "sgc-realtime-earthquakes";
    name: string;
    url: string;
    authority: "official";
  };
  fetchedAt: string;
  events: Array<z.infer<typeof eventSchema>>;
};

export interface SgcPublicSourceRepository {
  findSnapshot(): Promise<SgcPublicSnapshot | undefined>;
}

export class EmptySgcPublicSourceRepository implements SgcPublicSourceRepository {
  async findSnapshot() {
    return undefined;
  }
}

export class PostgresSgcPublicSourceRepository implements SgcPublicSourceRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findSnapshot(): Promise<SgcPublicSnapshot | undefined> {
    const sourceId = "sgc-realtime-earthquakes";
    const [source] = await this.sql<
      Array<{ display_name: string; source_url: string; last_seen_at: unknown }>
    >`
      SELECT s.display_name, s.source_url, max(r.last_seen_at) AS last_seen_at
      FROM external_sources s
      JOIN source_records r ON r.source_id = s.id AND r.active = true
      WHERE s.id = ${sourceId} AND s.active = true AND s.authority = 'official'
        AND s.data_classification = 'public_operational' AND r.record_type = 'seismic_event'
      GROUP BY s.display_name, s.source_url
    `;
    if (!source) return undefined;
    const rows = await this.sql<Array<{ payload: unknown }>>`
      SELECT payload FROM source_records
      WHERE source_id = ${sourceId} AND active = true AND record_type = 'seismic_event'
      ORDER BY payload->>'localTime' DESC
      LIMIT 1000
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
      events: rows.map((row) => eventSchema.parse(row.payload)),
    };
  }
}
