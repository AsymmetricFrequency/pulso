import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";

export const REDCALIAYUDA_SOURCE = {
  id: "redcaliayuda-necesidades",
  name: "Red Cali Ayuda — Necesidades",
  url: "https://redcaliayuda.vercel.app/necesidades",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  // Their own Next.js ISR cache revalidates every 5 minutes (x-nextjs-stale-time: 300) —
  // poll a bit slower than that so we're never hammering past their own cache window.
  crawlDelaySeconds: 600,
} as const;

// This site has no separate JSON API — the /necesidades page is a Next.js Server Component.
// Requesting it with the `RSC: 1` header returns just the React Server Component "flight"
// payload (much smaller than full HTML, and still a Vercel cache HIT) instead of rendered
// markup — each line is `<id>:<JSON value>`, and the data we want is nested somewhere inside
// as a plain `"necesidades": [...]` array, found by walking the parsed tree.
const RSC_URL = REDCALIAYUDA_SOURCE.url;

// redcaliayuda's own schema has no name/phone columns — but it's free citizen text, and at
// least one observed record had a full name + two phone numbers typed directly into
// `descripcion`/`cantidad` ("Se necesita Deylin Aponza Guaza 3174219573, 3183682587"). Any
// record whose free text contains a long digit run (phone number, cédula, etc.) is dropped
// entirely rather than partially redacted — a name can still remain even after stripping
// digits, and this project's standing rule is to never import third-party PII.
const LONG_DIGIT_RUN = /\d{7,}/;

// Only 4 distinct values observed; "EVACUACION" (structural-risk evacuation) doesn't cleanly
// match any existing category, so it maps to "otro" rather than being forced into a wrong fit.
const CATEGORY_MAP: Record<string, string> = {
  ALIMENTOS: "alimentos",
  ATENCION_MEDICA: "salud",
  EVACUACION: "otro",
  OTRO: "otro",
};

// Solo para el título cuando la persona no escribió qué necesita. Es lo mínimo honesto:
// decir de qué tipo es la necesidad, en vez de mostrar su dirección como si fuera el pedido.
const CATEGORY_LABELS: Record<string, string> = {
  ALIMENTOS: "Alimentos",
  ATENCION_MEDICA: "Atención médica",
  EVACUACION: "Evacuación por riesgo estructural",
  OTRO: "Necesidad sin especificar",
};

type NecesidadRecord = {
  id: string;
  codigo: string;
  categoria: string;
  prioridad: string;
  descripcion: string | null;
  cantidad: string | null;
  personasAfectadas: number | null;
  ninos: number | null;
  adultosMayores: number | null;
  zona: string | null;
  ciudad: string | null;
  lat: number;
  lng: number;
  createdAt: string;
};

export type MappedRedCaliAyudaPoint = {
  externalKey: string;
  reportType: "necesidad";
  category: string;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported";
  metadata: CommunityReportMetadata;
};

const isFiniteCoord = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function findNecesidadesArray(node: unknown): NecesidadRecord[] | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNecesidadesArray(item);
      if (found) return found;
    }
    return undefined;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (
      Array.isArray(record.necesidades) &&
      record.necesidades.every((item) => item && typeof item === "object" && "codigo" in item)
    ) {
      return record.necesidades as NecesidadRecord[];
    }
    for (const value of Object.values(record)) {
      const found = findNecesidadesArray(value);
      if (found) return found;
    }
  }
  return undefined;
}

export function parseRedCaliAyudaFlightPayload(body: string): NecesidadRecord[] {
  for (const line of body.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const rest = line.slice(separatorIndex + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rest);
    } catch {
      continue;
    }
    const found = findNecesidadesArray(parsed);
    if (found) return found;
  }
  return [];
}

export function mapRedCaliAyudaRecord(
  record: NecesidadRecord,
): MappedRedCaliAyudaPoint | undefined {
  if (!isFiniteCoord(record.lat) || !isFiniteCoord(record.lng)) return undefined;
  if (!isWithinColombia(record.lat, record.lng)) return undefined;

  const freeText = [record.descripcion, record.cantidad, record.zona].filter(Boolean).join(" ");
  if (LONG_DIGIT_RUN.test(freeText)) return undefined;

  const category = CATEGORY_MAP[record.categoria] ?? "otro";
  // `zona` es la dirección, no la necesidad. Ponerla de título hacía que un tercio del mapa
  // dijera «Calle 8b 65-295» donde debía decir qué falta. El titular sale de lo que la persona
  // pidió —`cantidad` primero, que es el texto más concreto— y la dirección se va a `address`.
  const title = (
    record.cantidad?.trim() ||
    record.descripcion?.trim() ||
    CATEGORY_LABELS[record.categoria] ||
    record.codigo
  ).slice(0, 140);
  if (title.length < 3) return undefined;

  const description = [record.descripcion?.trim(), record.cantidad?.trim(), record.zona?.trim()]
    .filter((part): part is string => Boolean(part) && part !== title)
    .join(" — ")
    .slice(0, 2_000);

  const needs = record.cantidad
    ? record.cantidad
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 40)
    : undefined;

  const metadata: CommunityReportMetadata = {
    address: record.zona?.trim() || undefined,
    city: record.ciudad?.trim() || undefined,
    urgency: record.prioridad?.trim() || undefined,
    needs,
    personsNeeded: record.personasAfectadas ?? undefined,
    reportedAt: record.createdAt,
    subSource: "Red Cali Ayuda",
  };

  return {
    externalKey: `necesidad:${record.id}`,
    reportType: "necesidad",
    category,
    title,
    description: description || null,
    location: { type: "Point", coordinates: [record.lng, record.lat] },
    status: "reported",
    metadata,
  };
}

export async function fetchRedCaliAyudaSnapshot() {
  const response = await fetch(RSC_URL, {
    headers: {
      RSC: "1",
      "User-Agent": "PULSO/0.1 public-emergency-data (+https://pulso.my)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Red Cali Ayuda /necesidades returned HTTP ${response.status}`);
  const body = await response.text();
  return parseRedCaliAyudaFlightPayload(body);
}

async function upsertCommunityReports(
  sql: Sql,
  incidentCode: string,
  points: MappedRedCaliAyudaPoint[],
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
      ${REDCALIAYUDA_SOURCE.id}, ${REDCALIAYUDA_SOURCE.name}, ${REDCALIAYUDA_SOURCE.url},
      ${REDCALIAYUDA_SOURCE.authority}, ${REDCALIAYUDA_SOURCE.classification},
      ${REDCALIAYUDA_SOURCE.collectionMode}, ${REDCALIAYUDA_SOURCE.crawlDelaySeconds}
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
        ${point.status}, ${REDCALIAYUDA_SOURCE.id}, ${point.externalKey}, ${randomUUID()},
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

export async function runRedCaliAyudaIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
}) {
  const records = await fetchRedCaliAyudaSnapshot();
  const points: MappedRedCaliAyudaPoint[] = [];
  let skippedForPii = 0;
  for (const record of records) {
    const freeText = [record.descripcion, record.cantidad, record.zona].filter(Boolean).join(" ");
    const mapped = mapRedCaliAyudaRecord(record);
    if (!mapped) {
      if (LONG_DIGIT_RUN.test(freeText)) skippedForPii += 1;
      continue;
    }
    points.push(mapped);
  }

  if (!options.databaseUrl) {
    return {
      status: "preview" as const,
      seen: records.length,
      mapped: points.length,
      skippedForPii,
      points,
    };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const upserted = await upsertCommunityReports(sql, options.incidentCode, points);
    return {
      status: "stored" as const,
      seen: records.length,
      mapped: points.length,
      skippedForPii,
      upserted,
    };
  } finally {
    await sql.end();
  }
}
