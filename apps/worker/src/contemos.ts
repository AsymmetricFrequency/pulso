import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";

export const CONTEMOS_SOURCE = {
  id: "contemos-mapa-situacion",
  name: "contemos — Mapa de situación unificado",
  url: "https://mapa.contemos.org/situacion.json",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  crawlDelaySeconds: 60,
} as const;

// contemos publishes free-text categories; map to Pulso's fixed taxonomy.
// Only the FIRST matching category in a comma-separated list is used (schema allows one).
const CATEGORY_MAP: Record<string, string> = {
  agua: "agua",
  alimentos: "alimentos",
  salud: "salud",
  refugio: "albergues",
  higiene: "higiene",
  herramienta: "herramienta",
  rescate_herr: "herramienta",
  rescate_epp: "herramienta",
  personas: "voluntariado",
  animales: "animales",
  logistica: "logistica",
  impresion3d: "otro",
};

type ContemosRecord = {
  id: string;
  clase: "necesidad" | "oferta" | "recurso" | string;
  fuente?: string;
  titulo?: string;
  categoria?: string;
  items?: string;
  lat?: number;
  lng?: number;
  direccion?: string;
  municipio?: string;
  departamento?: string | null;
  estado?: string;
  urgencia?: string;
  personas_faltan?: number;
  personas_hay?: number;
  contacto?: string;
  creado?: string;
  actualizado?: string;
  verificado?: boolean;
  confianza?: string;
  _n_reportes?: number;
  _notas?: string;
};

export type MappedContemosPoint = {
  externalKey: string;
  reportType: "necesidad" | "pmu";
  category: string | null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported" | "corroborated";
  metadata: CommunityReportMetadata;
};

const firstCategory = (raw: string | undefined): string | null => {
  if (!raw) return null;
  for (const token of raw.split(",")) {
    const mapped = CATEGORY_MAP[token.trim()];
    if (mapped) return mapped;
  }
  return null;
};

const isFiniteCoord = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function mapContemosRecord(record: ContemosRecord): MappedContemosPoint | undefined {
  if (record.clase !== "necesidad" && record.clase !== "recurso") return undefined;
  if (!isFiniteCoord(record.lat) || !isFiniteCoord(record.lng)) return undefined;
  if (!isWithinColombia(record.lat, record.lng)) return undefined;

  const reportType = record.clase === "necesidad" ? "necesidad" : "pmu";
  const category = firstCategory(record.categoria);
  if (reportType === "necesidad" && !category) return undefined;

  const title = (record.titulo ?? "").trim().slice(0, 140);
  if (title.length < 3) return undefined;

  const description = [record.items, record._notas]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" — ")
    .slice(0, 2_000);

  const needs = record.items
    ? record.items
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 40)
    : undefined;

  const metadata: CommunityReportMetadata = {
    address: record.direccion?.trim() || undefined,
    city: record.municipio?.trim() || undefined,
    department: record.departamento?.trim() || undefined,
    urgency: record.urgencia?.trim() || undefined,
    sourceStatus: record.estado?.trim() || undefined,
    needs,
    personsNeeded: record.personas_faltan,
    personsPresent: record.personas_hay,
    reportedAt: record.creado,
    reportUpdatedAt: record.actualizado,
    confidence: record.confianza?.trim() || undefined,
    corroborationCount: record._n_reportes,
    subSource: record.fuente?.trim() || undefined,
    hasContact: record.contacto ? record.contacto.trim().length > 0 : undefined,
  };

  return {
    externalKey: record.id,
    reportType,
    category,
    title,
    description: description || null,
    location: { type: "Point", coordinates: [record.lng, record.lat] },
    status: record.verificado ? "corroborated" : "reported",
    metadata,
  };
}

export async function fetchContemosSnapshot() {
  const response = await fetch(CONTEMOS_SOURCE.url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PULSO-VIDA/0.1 public-emergency-data (+https://pulso.my)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`contemos feed returned HTTP ${response.status}`);
  const payload = (await response.json()) as { registros?: ContemosRecord[] };
  if (!Array.isArray(payload.registros)) throw new Error("contemos feed has no 'registros' array");
  return payload.registros;
}

async function upsertCommunityReports(
  sql: Sql,
  incidentCode: string,
  points: MappedContemosPoint[],
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
      ${CONTEMOS_SOURCE.id}, ${CONTEMOS_SOURCE.name}, ${CONTEMOS_SOURCE.url},
      ${CONTEMOS_SOURCE.authority}, ${CONTEMOS_SOURCE.classification},
      ${CONTEMOS_SOURCE.collectionMode}, ${CONTEMOS_SOURCE.crawlDelaySeconds}
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
        ${point.status}, ${CONTEMOS_SOURCE.id}, ${point.externalKey}, ${randomUUID()},
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

export async function runContemosIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
}) {
  const registros = await fetchContemosSnapshot();
  const points = registros
    .map(mapContemosRecord)
    .filter((point): point is MappedContemosPoint => point !== undefined);

  if (!options.databaseUrl) {
    return { status: "preview" as const, seen: registros.length, mapped: points.length, points };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const upserted = await upsertCommunityReports(sql, options.incidentCode, points);
    return { status: "stored" as const, seen: registros.length, mapped: points.length, upserted };
  } finally {
    await sql.end();
  }
}
