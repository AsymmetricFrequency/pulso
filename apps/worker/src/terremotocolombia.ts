import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";

export const TERREMOTOCOLOMBIA_SOURCE = {
  id: "terremotocolombia-co",
  name: "terremotocolombia.co",
  url: "https://terremotocolombia.co/",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  // /api/acopio is CDN-cached with max-age=14400/s-maxage=120 — poll well below that.
  crawlDelaySeconds: 240,
} as const;

const API_BASE = "https://api.terremotocolombia.co";

// terremotocolombia.co also exposes /api/missing and /api/pets — those carry real names,
// phone numbers, ages, and photos of missing people and lost pets. Never fetch or import
// them. /api/hospitals is institutional/aggregate (patient counts, not names) but has no
// coordinates in this feed, so there's nowhere to place it on the map — skipped for now.
const ACOPIO_URL = `${API_BASE}/api/acopio`;

const ACCEPTS_LABEL: Record<string, string> = {
  water: "Agua",
  tools: "Herramientas",
  blankets: "Cobijas",
  food: "Alimentos",
  blood: "Sangre",
  clothing: "Ropa",
  hygiene: "Aseo",
  medical_supplies: "Insumos médicos",
  medicines: "Medicamentos",
  shelter: "Refugio",
};

type AcopioRecord = {
  id: string;
  name: string;
  manager: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  accepts: string[] | null;
  contact: string | null;
  schedule: string | null;
  status: string | null;
  verificationLevel: "citizen" | "official" | "verified" | string;
  disputed: boolean;
  description: string | null;
};

export type MappedTerremotoColombiaPoint = {
  externalKey: string;
  reportType: "pmu";
  category: null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported" | "corroborated" | "validated";
  metadata: CommunityReportMetadata;
};

const isFiniteCoord = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const acopioStatus = (record: AcopioRecord): MappedTerremotoColombiaPoint["status"] => {
  if (record.disputed) return "reported";
  if (record.verificationLevel === "verified") return "validated";
  if (record.verificationLevel === "official") return "corroborated";
  return "reported";
};

export function mapAcopioRecord(record: AcopioRecord): MappedTerremotoColombiaPoint | undefined {
  if (!isFiniteCoord(record.lat) || !isFiniteCoord(record.lng)) return undefined;
  if (!isWithinColombia(record.lat, record.lng)) return undefined;
  const title = (record.name ?? "").trim().slice(0, 140);
  if (title.length < 3) return undefined;

  const needs = (record.accepts ?? [])
    .map((tag) => ACCEPTS_LABEL[tag] ?? tag)
    .filter(Boolean)
    .slice(0, 40);

  const description = record.description?.trim().slice(0, 2_000) || null;

  const metadata: CommunityReportMetadata = {
    address: record.address?.trim() || undefined,
    city: record.city?.trim() || undefined,
    organization: record.manager?.trim() || undefined,
    schedule: record.schedule?.trim() || undefined,
    sourceStatus: record.status?.trim() || undefined,
    needs: needs.length > 0 ? needs : undefined,
    hasContact: Boolean(record.contact),
  };

  return {
    externalKey: `acopio:${record.id}`,
    reportType: "pmu",
    category: null,
    title,
    description,
    location: { type: "Point", coordinates: [record.lng, record.lat] },
    status: acopioStatus(record),
    metadata,
  };
}

export async function fetchTerremotoColombiaSnapshot() {
  const headers = {
    Accept: "application/json",
    "User-Agent": "PULSO/0.1 public-emergency-data (+https://pulso.my)",
  };
  const response = await fetch(ACOPIO_URL, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`terremotocolombia.co acopio feed returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as AcopioRecord[] | { items?: AcopioRecord[] };
  const acopio = Array.isArray(payload) ? payload : (payload.items ?? []);
  return { acopio };
}

async function upsertCommunityReports(
  sql: Sql,
  incidentCode: string,
  points: MappedTerremotoColombiaPoint[],
) {
  const [incident] = await sql<
    { id: string }[]
  >`SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1`;
  if (!incident) throw new Error(`Incident ${incidentCode} does not exist`);

  await sql`
    INSERT INTO external_sources (
      id, display_name, source_url, authority, data_classification,
      collection_mode, crawl_delay_seconds
    ) VALUES (
      ${TERREMOTOCOLOMBIA_SOURCE.id}, ${TERREMOTOCOLOMBIA_SOURCE.name}, ${TERREMOTOCOLOMBIA_SOURCE.url},
      ${TERREMOTOCOLOMBIA_SOURCE.authority}, ${TERREMOTOCOLOMBIA_SOURCE.classification},
      ${TERREMOTOCOLOMBIA_SOURCE.collectionMode}, ${TERREMOTOCOLOMBIA_SOURCE.crawlDelaySeconds}
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      source_url = EXCLUDED.source_url,
      active = true,
      updated_at = now()
  `;

  let upserted = 0;
  for (const point of points) {
    await sql`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        status, external_source_id, external_key, client_mutation_id, metadata
      ) VALUES (
        ${randomUUID()}, ${incident.id}, ${point.reportType}, ${point.category}, ${point.title},
        ${point.description},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(point.location)}), 4326),
        ${point.status}, ${TERREMOTOCOLOMBIA_SOURCE.id}, ${point.externalKey}, ${randomUUID()},
        ${sql.json(point.metadata)}
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
    `;
    upserted += 1;
  }
  return upserted;
}

export async function runTerremotoColombiaIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
}) {
  const { acopio } = await fetchTerremotoColombiaSnapshot();
  const points = acopio
    .map(mapAcopioRecord)
    .filter((point): point is MappedTerremotoColombiaPoint => point !== undefined);

  if (!options.databaseUrl) {
    return {
      status: "preview" as const,
      seenAcopio: acopio.length,
      mapped: points.length,
      points,
    };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const upserted = await upsertCommunityReports(sql, options.incidentCode, points);
    return {
      status: "stored" as const,
      seenAcopio: acopio.length,
      mapped: points.length,
      upserted,
    };
  } finally {
    await sql.end();
  }
}
