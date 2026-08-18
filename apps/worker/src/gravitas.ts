import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";

export const GRAVITAS_SOURCE = {
  id: "gravitas-mapa-ciudadano",
  name: "GRAVITAS — Mapeo ciudadano de emergencia",
  url: "https://www.mapa.gravitasworld.com/api/snapshot",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  crawlDelaySeconds: 60,
} as const;

// Only institutional/physical coordination points are imported — never "persona_disponible"
// (individual volunteers, whose address_text is frequently a private home address) or
// "edificio" (building damage reports, which can also pin an individual's residence).
const IMPORTABLE_CATEGORIES = new Set(["centro_acopio"]);

const SUBTYPE_CATEGORY_MAP: Record<string, string> = {
  atencion_medica: "salud",
  alimentos: "alimentos",
  agua: "agua",
  refugio: "albergues",
  higiene: "higiene",
};

type GravitasFeature = {
  type?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown };
  properties?: {
    id?: unknown;
    title?: unknown;
    category?: unknown;
    status?: unknown;
    address_text?: unknown;
    description?: unknown;
    city?: unknown;
    neighborhood?: unknown;
    department_name?: unknown;
    department_priority?: unknown;
    trust_level?: unknown;
    report_count?: unknown;
    first_reported_at?: unknown;
    last_reported_at?: unknown;
    needs_cubiertas?: unknown;
    needs_abierta?: unknown;
    category_fields?: {
      tipo?: unknown;
      contacto?: unknown;
      capacidad_actual?: unknown;
      organizacion_responsable?: unknown;
      necesita?: unknown;
      horario?: unknown;
    };
  };
};

export type MappedGravitasPoint = {
  externalKey: string;
  reportType: "pmu";
  category: string | null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported" | "corroborated" | "validated";
  metadata: CommunityReportMetadata;
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function mapGravitasFeature(feature: GravitasFeature): MappedGravitasPoint | undefined {
  const properties = feature.properties;
  const coordinates = feature.geometry?.coordinates;
  if (
    feature.geometry?.type !== "Point" ||
    !Array.isArray(coordinates) ||
    !properties ||
    typeof properties.id !== "string"
  ) {
    return undefined;
  }
  const category = text(properties.category);
  if (!category || !IMPORTABLE_CATEGORIES.has(category)) return undefined;

  const lng = coordinates[0];
  const lat = coordinates[1];
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat) || !isWithinColombia(lat, lng)) {
    return undefined;
  }

  const title = text(properties.title)?.slice(0, 140);
  if (!title || title.length < 3) return undefined;

  const place = [text(properties.city), text(properties.department_name)]
    .filter(Boolean)
    .join(", ");
  const address = text(properties.address_text)?.slice(0, 600);
  const description = [
    text(properties.description),
    address ? `Dirección: ${address}` : undefined,
    place,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" — ")
    .slice(0, 2_000);

  const tipo = text(properties.category_fields?.tipo);
  const mappedCategory = tipo ? (SUBTYPE_CATEGORY_MAP[tipo] ?? null) : null;

  const trustLevel = isFiniteNumber(properties.trust_level) ? properties.trust_level : 0;
  const status = trustLevel >= 2 ? "validated" : trustLevel >= 1 ? "corroborated" : "reported";

  const necesita = text(properties.category_fields?.necesita);
  const needs = necesita
    ? necesita
        .split(/[,|]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 40)
    : undefined;

  const metadata: CommunityReportMetadata = {
    address,
    city: text(properties.city),
    neighborhood: text(properties.neighborhood),
    department: text(properties.department_name),
    departmentPriority: text(properties.department_priority),
    sourceStatus: text(properties.status),
    needs,
    capacity: text(properties.category_fields?.capacidad_actual),
    schedule: text(properties.category_fields?.horario),
    organization: text(properties.category_fields?.organizacion_responsable),
    reportedAt: text(properties.first_reported_at),
    reportUpdatedAt: text(properties.last_reported_at),
    corroborationCount: isFiniteNumber(properties.report_count)
      ? properties.report_count
      : undefined,
    needsOpen: isFiniteNumber(properties.needs_abierta) ? properties.needs_abierta : undefined,
    needsCovered: isFiniteNumber(properties.needs_cubiertas)
      ? properties.needs_cubiertas
      : undefined,
    hasContact: Boolean(text(properties.category_fields?.contacto)),
  };

  return {
    externalKey: properties.id,
    reportType: "pmu",
    category: mappedCategory,
    title,
    description: description || null,
    location: { type: "Point", coordinates: [lng, lat] },
    status,
    metadata,
  };
}

export async function fetchGravitasSnapshot() {
  const response = await fetch(GRAVITAS_SOURCE.url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PULSO-VIDA/0.1 public-emergency-data (+https://pulso.my)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Gravitas feed returned HTTP ${response.status}`);
  const payload = (await response.json()) as { features?: GravitasFeature[] };
  if (!Array.isArray(payload.features)) throw new Error("Gravitas feed has no 'features' array");
  return payload.features;
}

async function upsertCommunityReports(
  sql: Sql,
  incidentCode: string,
  points: MappedGravitasPoint[],
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
      ${GRAVITAS_SOURCE.id}, ${GRAVITAS_SOURCE.name}, ${GRAVITAS_SOURCE.url},
      ${GRAVITAS_SOURCE.authority}, ${GRAVITAS_SOURCE.classification},
      ${GRAVITAS_SOURCE.collectionMode}, ${GRAVITAS_SOURCE.crawlDelaySeconds}
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
        ${point.status}, ${GRAVITAS_SOURCE.id}, ${point.externalKey}, ${randomUUID()},
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

export async function runGravitasIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
}) {
  const features = await fetchGravitasSnapshot();
  const points = features
    .map(mapGravitasFeature)
    .filter((point): point is MappedGravitasPoint => point !== undefined);

  if (!options.databaseUrl) {
    return { status: "preview" as const, seen: features.length, mapped: points.length, points };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const upserted = await upsertCommunityReports(sql, options.incidentCode, points);
    return { status: "stored" as const, seen: features.length, mapped: points.length, upserted };
  } finally {
    await sql.end();
  }
}
