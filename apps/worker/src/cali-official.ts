import { createHash, randomUUID } from "node:crypto";
import * as cheerio from "cheerio";
import postgres, { type Sql } from "postgres";

export const CALI_OFFICIAL_SOURCE = {
  id: "cali-official-earthquake-repository",
  name: "Alcaldía de Cali — Repositorio oficial del terremoto",
  url: "https://www.cali.gov.co/gobierno/publicaciones/193607/terremoto-de-cali-repositorio-oficial-de-informacion/",
  authority: "official",
  classification: "public_operational",
  crawlDelaySeconds: 5,
} as const;

export type OfficialMetric = {
  key: "deaths" | "injured" | "collapsed_buildings" | "missing" | "rescued";
  value: number;
  label: string;
};

export type OfficialServicePoint = {
  externalKey: string;
  type: "collection_center" | "shelter" | "blood_donation";
  name: string;
  address?: string;
  status: "open" | "closed" | "unknown";
  mapUrl?: string;
  schedule?: string;
};

export type CaliOfficialSnapshot = {
  sourceId: typeof CALI_OFFICIAL_SOURCE.id;
  sourceUrl: string;
  fetchedAt: string;
  sourceUpdatedLabel: string;
  officialReportUrl?: string;
  metrics: OfficialMetric[];
  servicePoints: OfficialServicePoint[];
  contentHash: string;
};

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const numberFromText = (value: string) => Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const metricDefinitions: Array<{
  selector: string;
  key: OfficialMetric["key"];
  label: string;
}> = [
  { selector: "#fallecidos", key: "deaths", label: "Personas fallecidas" },
  { selector: "#lesionados", key: "injured", label: "Personas lesionadas" },
  {
    selector: "#colapsadas",
    key: "collapsed_buildings",
    label: "Edificaciones con colapso total",
  },
  { selector: "#desaparecidas", key: "missing", label: "Personas desaparecidas" },
  { selector: "#rescatadas", key: "rescued", label: "Personas rescatadas" },
];

function pointType(title: string): OfficialServicePoint["type"] | undefined {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("acopio")) return "collection_center";
  if (normalized.includes("albergue")) return "shelter";
  if (normalized.includes("sangre")) return "blood_donation";
  return undefined;
}

export function parseCaliOfficialPage(html: string, fetchedAt = new Date().toISOString()) {
  const $ = cheerio.load(html);
  const metrics = metricDefinitions.map(({ selector, key, label }) => {
    const value = numberFromText($(selector).first().text());
    if (!Number.isFinite(value)) throw new Error(`Missing official metric: ${selector}`);
    return { key, value, label } satisfies OfficialMetric;
  });

  const servicePoints: OfficialServicePoint[] = [];
  $(".cali-emergency__location-group").each((_groupIndex, group) => {
    const groupTitle = compact(
      $(group).find(".cali-emergency__location-group-title").first().text(),
    );
    const type = pointType(groupTitle);
    if (!type) return;
    const scheduleMatch = groupTitle.match(/\(([^)]+)\)/);

    $(group)
      .find(".cali-emergency__location-item")
      .each((_itemIndex, item) => {
        const name = compact($(item).find(".cali-emergency__location-name").first().text());
        if (!name) return;
        const address = compact($(item).find(".cali-emergency__location-address").first().text());
        const statusText = compact(
          $(item).find(".cali-emergency__location-status").text(),
        ).toLowerCase();
        const mapUrl = $(item).find("a.cali-emergency__location-link").first().attr("href");
        const status =
          $(item).hasClass("cali-emergency__location-item--closed") ||
          statusText.includes("cerrado")
            ? "closed"
            : "open";
        const externalKey = hash(`${type}|${name.toLowerCase()}`).slice(0, 24);
        servicePoints.push({
          externalKey,
          type,
          name,
          status,
          ...(address ? { address } : {}),
          ...(mapUrl ? { mapUrl } : {}),
          ...(scheduleMatch?.[1] ? { schedule: compact(scheduleMatch[1]) } : {}),
        });
      });
  });

  const sourceUpdatedLabel = compact($("#main-data .balance__updated").first().text());
  if (!sourceUpdatedLabel) throw new Error("Missing source update label");
  const officialReportUrl = $("#main-data .balance__download").first().attr("href");

  const canonical = JSON.stringify({ sourceUpdatedLabel, metrics, servicePoints });
  return {
    sourceId: CALI_OFFICIAL_SOURCE.id,
    sourceUrl: CALI_OFFICIAL_SOURCE.url,
    fetchedAt,
    sourceUpdatedLabel,
    ...(officialReportUrl ? { officialReportUrl } : {}),
    metrics,
    servicePoints,
    contentHash: hash(canonical),
  } satisfies CaliOfficialSnapshot;
}

type FetchOptions = { etag?: string; lastModified?: string };

export async function fetchCaliOfficialPage(options: FetchOptions = {}) {
  const headers = new Headers({
    Accept: "text/html,application/xhtml+xml",
    "User-Agent": "PULSO-VIDA/0.1 public-emergency-data (+https://pulso.my)",
  });
  if (options.etag) headers.set("If-None-Match", options.etag);
  if (options.lastModified) headers.set("If-Modified-Since", options.lastModified);

  const response = await fetch(CALI_OFFICIAL_SOURCE.url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 304) {
    return { status: 304 as const, etag: options.etag, lastModified: options.lastModified };
  }
  if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}`);
  return {
    status: 200 as const,
    html: await response.text(),
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
  };
}

export class SourceIngestionRepository {
  constructor(private readonly sql: Sql) {}

  async lastSuccessfulRun() {
    const [row] = await this.sql<
      {
        etag: string | null;
        last_modified: string | null;
      }[]
    >`
      SELECT etag, last_modified
      FROM source_ingestion_runs
      WHERE source_id = ${CALI_OFFICIAL_SOURCE.id} AND status IN ('unchanged', 'succeeded')
      ORDER BY finished_at DESC
      LIMIT 1
    `;
    return row;
  }

  async save(snapshot: CaliOfficialSnapshot, metadata: { etag?: string; lastModified?: string }) {
    const runId = randomUUID();
    await this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO external_sources (
          id, display_name, source_url, authority, data_classification,
          collection_mode, crawl_delay_seconds
        ) VALUES (
          ${CALI_OFFICIAL_SOURCE.id}, ${CALI_OFFICIAL_SOURCE.name}, ${CALI_OFFICIAL_SOURCE.url},
          ${CALI_OFFICIAL_SOURCE.authority}, ${CALI_OFFICIAL_SOURCE.classification},
          'html_import', ${CALI_OFFICIAL_SOURCE.crawlDelaySeconds}
        )
        ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          source_url = EXCLUDED.source_url,
          updated_at = now()
      `;
      await transaction`
        INSERT INTO source_ingestion_runs (
          id, source_id, status, started_at, finished_at, http_status,
          etag, last_modified, content_hash, records_seen
        ) VALUES (
          ${runId}, ${snapshot.sourceId}, 'succeeded', ${snapshot.fetchedAt}, now(), 200,
          ${metadata.etag ?? null}, ${metadata.lastModified ?? null},
          ${snapshot.contentHash}, ${snapshot.metrics.length + snapshot.servicePoints.length}
        )
      `;

      const records = [
        ...snapshot.metrics.map((metric) => ({
          externalKey: `metric:${metric.key}`,
          recordType: "incident_metric",
          payload: { ...metric, sourceUpdatedLabel: snapshot.sourceUpdatedLabel },
        })),
        ...snapshot.servicePoints.map((point) => ({
          externalKey: `service-point:${point.externalKey}`,
          recordType: "service_point",
          payload: point,
        })),
      ];

      for (const record of records) {
        const recordHash = hash(JSON.stringify(record.payload));
        const [current] = await transaction<{ id: string; content_hash: string }[]>`
          SELECT id, content_hash FROM source_records
          WHERE source_id = ${snapshot.sourceId} AND external_key = ${record.externalKey}
        `;
        if (!current) {
          const id = randomUUID();
          await transaction`
            INSERT INTO source_records (
              id, source_id, external_key, record_type, observed_at,
              payload, content_hash, first_seen_at, last_seen_at
            ) VALUES (
              ${id}, ${snapshot.sourceId}, ${record.externalKey}, ${record.recordType},
              ${snapshot.fetchedAt}, ${transaction.json(record.payload)}, ${recordHash}, now(), now()
            )
          `;
          await transaction`
            INSERT INTO source_record_versions (id, source_record_id, ingestion_run_id, payload, content_hash)
            VALUES (${randomUUID()}, ${id}, ${runId}, ${transaction.json(record.payload)}, ${recordHash})
          `;
        } else if (current.content_hash !== recordHash) {
          await transaction`
            UPDATE source_records SET payload = ${transaction.json(record.payload)},
              content_hash = ${recordHash}, observed_at = ${snapshot.fetchedAt},
              last_seen_at = now(), active = true
            WHERE id = ${current.id}
          `;
          await transaction`
            INSERT INTO source_record_versions (id, source_record_id, ingestion_run_id, payload, content_hash)
            VALUES (${randomUUID()}, ${current.id}, ${runId}, ${transaction.json(record.payload)}, ${recordHash})
          `;
        } else {
          await transaction`UPDATE source_records SET last_seen_at = now(), active = true WHERE id = ${current.id}`;
        }
      }
    });
    return runId;
  }

  async saveUnchanged(metadata: { etag?: string; lastModified?: string }) {
    await this.sql`
      INSERT INTO source_ingestion_runs (
        id, source_id, status, started_at, finished_at, http_status, etag, last_modified, records_seen
      ) VALUES (
        ${randomUUID()}, ${CALI_OFFICIAL_SOURCE.id}, 'unchanged', now(), now(), 304,
        ${metadata.etag ?? null}, ${metadata.lastModified ?? null}, 0
      )
    `;
  }
}

export async function runCaliOfficialIngestion(databaseUrl?: string) {
  const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : undefined;
  try {
    const repository = sql ? new SourceIngestionRepository(sql) : undefined;
    const previous = repository ? await repository.lastSuccessfulRun() : undefined;
    const response = await fetchCaliOfficialPage({
      ...(previous?.etag ? { etag: previous.etag } : {}),
      ...(previous?.last_modified ? { lastModified: previous.last_modified } : {}),
    });
    if (response.status === 304) {
      await repository?.saveUnchanged({
        ...(response.etag ? { etag: response.etag } : {}),
        ...(response.lastModified ? { lastModified: response.lastModified } : {}),
      });
      return { status: "unchanged" as const };
    }
    const snapshot = parseCaliOfficialPage(response.html);
    const runId = await repository?.save(snapshot, {
      ...(response.etag ? { etag: response.etag } : {}),
      ...(response.lastModified ? { lastModified: response.lastModified } : {}),
    });
    return { status: databaseUrl ? ("stored" as const) : ("preview" as const), runId, snapshot };
  } finally {
    await sql?.end();
  }
}
