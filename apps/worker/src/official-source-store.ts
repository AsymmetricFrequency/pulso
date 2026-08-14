import { createHash, randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

export type OfficialSourceDefinition = {
  id: string;
  name: string;
  url: string;
  authority: "official";
  classification: "public_operational" | "public_aggregate";
  collectionMode: "api" | "html_import";
  crawlDelaySeconds: number;
};

export type SourceRecordInput = {
  externalKey: string;
  recordType: "incident_metric" | "service_point" | "territory" | "seismic_event";
  payload: postgres.JSONValue;
};

export const contentHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class OfficialSourceStore {
  constructor(private readonly sql: Sql) {}

  async lastSuccessfulRun(sourceId: string) {
    const [row] = await this.sql<
      Array<{ etag: string | null; last_modified: string | null; content_hash: string | null }>
    >`
      SELECT etag, last_modified, content_hash
      FROM source_ingestion_runs
      WHERE source_id = ${sourceId} AND status IN ('unchanged', 'succeeded')
      ORDER BY finished_at DESC
      LIMIT 1
    `;
    return row;
  }

  async save(
    source: OfficialSourceDefinition,
    snapshot: {
      observedAt: string;
      contentHash: string;
      records: SourceRecordInput[];
      etag?: string;
      lastModified?: string;
    },
  ) {
    const runId = randomUUID();
    await this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO external_sources (
          id, display_name, source_url, authority, data_classification,
          collection_mode, crawl_delay_seconds
        ) VALUES (
          ${source.id}, ${source.name}, ${source.url}, ${source.authority},
          ${source.classification}, ${source.collectionMode}, ${source.crawlDelaySeconds}
        )
        ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          source_url = EXCLUDED.source_url,
          data_classification = EXCLUDED.data_classification,
          collection_mode = EXCLUDED.collection_mode,
          crawl_delay_seconds = EXCLUDED.crawl_delay_seconds,
          active = true,
          updated_at = now()
      `;
      await transaction`
        INSERT INTO source_ingestion_runs (
          id, source_id, status, started_at, finished_at, http_status,
          etag, last_modified, content_hash, records_seen
        ) VALUES (
          ${runId}, ${source.id}, 'succeeded', ${snapshot.observedAt}, now(), 200,
          ${snapshot.etag ?? null}, ${snapshot.lastModified ?? null},
          ${snapshot.contentHash}, ${snapshot.records.length}
        )
      `;

      for (const record of snapshot.records) {
        const recordHash = contentHash(record.payload);
        const [current] = await transaction<Array<{ id: string; content_hash: string }>>`
          SELECT id, content_hash FROM source_records
          WHERE source_id = ${source.id} AND external_key = ${record.externalKey}
        `;
        if (!current) {
          const id = randomUUID();
          await transaction`
            INSERT INTO source_records (
              id, source_id, external_key, record_type, observed_at,
              payload, content_hash, first_seen_at, last_seen_at
            ) VALUES (
              ${id}, ${source.id}, ${record.externalKey}, ${record.recordType},
              ${snapshot.observedAt}, ${transaction.json(record.payload)}, ${recordHash}, now(), now()
            )
          `;
          await transaction`
            INSERT INTO source_record_versions (id, source_record_id, ingestion_run_id, payload, content_hash)
            VALUES (${randomUUID()}, ${id}, ${runId}, ${transaction.json(record.payload)}, ${recordHash})
            ON CONFLICT (source_record_id, content_hash) DO NOTHING
          `;
        } else if (current.content_hash !== recordHash) {
          await transaction`
            UPDATE source_records SET payload = ${transaction.json(record.payload)},
              content_hash = ${recordHash}, observed_at = ${snapshot.observedAt},
              last_seen_at = now(), active = true
            WHERE id = ${current.id}
          `;
          await transaction`
            INSERT INTO source_record_versions (id, source_record_id, ingestion_run_id, payload, content_hash)
            VALUES (${randomUUID()}, ${current.id}, ${runId}, ${transaction.json(record.payload)}, ${recordHash})
            ON CONFLICT (source_record_id, content_hash) DO NOTHING
          `;
        } else {
          await transaction`UPDATE source_records SET last_seen_at = now(), active = true WHERE id = ${current.id}`;
        }
      }
    });
    return runId;
  }

  async saveUnchanged(
    source: OfficialSourceDefinition,
    metadata: { etag?: string; lastModified?: string },
  ) {
    await this.sql`
      INSERT INTO source_ingestion_runs (
        id, source_id, status, started_at, finished_at, http_status,
        etag, last_modified, records_seen
      ) VALUES (
        ${randomUUID()}, ${source.id}, 'unchanged', now(), now(), 304,
        ${metadata.etag ?? null}, ${metadata.lastModified ?? null}, 0
      )
    `;
  }
}

export const openSourceDatabase = (databaseUrl?: string) =>
  databaseUrl ? postgres(databaseUrl, { max: 1 }) : undefined;
