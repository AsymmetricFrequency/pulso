import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";

export const AYUDAS_PEREIRA_SOURCE = {
  id: "ayudaspereira-centros",
  name: "Ayudas Pereira — Centros de acopio",
  url: "https://ayudaspereira.com/",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  crawlDelaySeconds: 120,
} as const;

// Public Supabase REST endpoint + publishable key, as embedded in ayudaspereira.com's own
// client bundle (Supabase publishable keys are explicitly designed to be exposed client-side,
// protected by row-level security on the server — this is not a secret).
const SUPABASE_URL = "https://yjkyzfuixdpuhgthoeua.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_hWboFTjrnhfsAn5gXDW_Gg_rqx2iGLR";

// Free-text categoria values observed in the necesidades table, mapped to Pulso's taxonomy.
const CATEGORY_MAP: Record<string, string> = {
  Agua: "agua",
  "Alimentos no perecederos": "alimentos",
  "Comidas listas para comer": "alimentos",
  Medicamentos: "salud",
  "Aseo e higiene": "higiene",
  "Pañales y bebés": "higiene",
  "Cobijas y colchonetas": "albergues",
  "Ropa y franelas": "otro",
  "Linternas y pilas": "herramienta",
  Otros: "otro",
};

type Centro = {
  id: string;
  nombre: string | null;
  direccion: string | null;
  activo: boolean;
  lat: number | null;
  lng: number | null;
  created_at?: string;
};

type Necesidad = {
  id: string;
  centro_id: string;
  categoria: string | null;
  descripcion: string | null;
  prioridad: string | null;
  estado: string | null;
  created_at?: string;
};

export type MappedAyudasPereiraPoint = {
  externalKey: string;
  reportType: "acopio" | "necesidad";
  category: string | null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported" | "validated";
  metadata: CommunityReportMetadata;
};

async function supabaseGet<T>(table: string, select: string, extraQuery = ""): Promise<T[]> {
  const response = await fetch(
    `${SUPABASE_URL}/${table}?select=${encodeURIComponent(select)}${extraQuery}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Accept: "application/json",
        "User-Agent": "PULSO-VIDA/0.1 public-emergency-data (+https://pulso.my)",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new Error(`Ayudas Pereira feed returned HTTP ${response.status} for ${table}`);
  return (await response.json()) as T[];
}

const isFiniteCoord = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export async function fetchAyudasPereiraSnapshot() {
  const [centros, necesidades] = await Promise.all([
    supabaseGet<Centro>(
      "centros",
      "id,nombre,direccion,activo,lat,lng,created_at",
      "&activo=eq.true",
    ),
    supabaseGet<Necesidad>(
      "necesidades",
      "id,centro_id,categoria,descripcion,prioridad,estado,created_at",
    ),
  ]);
  return { centros, necesidades };
}

export function mapAyudasPereiraSnapshot(
  centros: Centro[],
  necesidades: Necesidad[],
): MappedAyudasPereiraPoint[] {
  const points: MappedAyudasPereiraPoint[] = [];
  const centrosById = new Map(centros.map((c) => [c.id, c]));

  for (const centro of centros) {
    if (!isFiniteCoord(centro.lat) || !isFiniteCoord(centro.lng)) continue;
    if (!isWithinColombia(centro.lat, centro.lng)) continue;
    const title = (centro.nombre ?? "").trim().slice(0, 140);
    if (title.length < 3) continue;
    points.push({
      externalKey: `centro:${centro.id}`,
      reportType: "acopio",
      category: null,
      title,
      description: centro.direccion?.trim() || null,
      location: { type: "Point", coordinates: [centro.lng, centro.lat] },
      status: "reported",
      metadata: {
        address: centro.direccion?.trim() || undefined,
        reportedAt: centro.created_at,
      },
    });
  }

  for (const necesidad of necesidades) {
    const centro = centrosById.get(necesidad.centro_id);
    if (!centro || !isFiniteCoord(centro.lat) || !isFiniteCoord(centro.lng)) continue;
    if (!isWithinColombia(centro.lat, centro.lng)) continue;
    const category = necesidad.categoria ? (CATEGORY_MAP[necesidad.categoria] ?? "otro") : "otro";
    const title = (necesidad.categoria ?? "Necesidad").trim().slice(0, 140);
    const description = [
      necesidad.prioridad ? `Prioridad ${necesidad.prioridad}` : undefined,
      necesidad.descripcion?.trim(),
      centro.nombre ? `Centro: ${centro.nombre}` : undefined,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" — ")
      .slice(0, 2_000);
    points.push({
      externalKey: `necesidad:${necesidad.id}`,
      reportType: "necesidad",
      category,
      title,
      description: description || null,
      location: { type: "Point", coordinates: [centro.lng, centro.lat] },
      status: necesidad.estado === "cubierta" ? "validated" : "reported",
      metadata: {
        address: centro.direccion?.trim() || undefined,
        organization: centro.nombre?.trim() || undefined,
        urgency: necesidad.prioridad?.trim() || undefined,
        sourceStatus: necesidad.estado?.trim() || undefined,
        reportedAt: necesidad.created_at,
      },
    });
  }

  return points;
}

async function upsertCommunityReports(
  sql: Sql,
  incidentCode: string,
  points: MappedAyudasPereiraPoint[],
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
      ${AYUDAS_PEREIRA_SOURCE.id}, ${AYUDAS_PEREIRA_SOURCE.name}, ${AYUDAS_PEREIRA_SOURCE.url},
      ${AYUDAS_PEREIRA_SOURCE.authority}, ${AYUDAS_PEREIRA_SOURCE.classification},
      ${AYUDAS_PEREIRA_SOURCE.collectionMode}, ${AYUDAS_PEREIRA_SOURCE.crawlDelaySeconds}
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
        ${point.status}, ${AYUDAS_PEREIRA_SOURCE.id}, ${point.externalKey}, ${randomUUID()},
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

export async function runAyudasPereiraIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
}) {
  const { centros, necesidades } = await fetchAyudasPereiraSnapshot();
  const points = mapAyudasPereiraSnapshot(centros, necesidades);

  if (!options.databaseUrl) {
    return {
      status: "preview" as const,
      seenCentros: centros.length,
      seenNecesidades: necesidades.length,
      mapped: points.length,
      points,
    };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const upserted = await upsertCommunityReports(sql, options.incidentCode, points);
    return {
      status: "stored" as const,
      seenCentros: centros.length,
      seenNecesidades: necesidades.length,
      mapped: points.length,
      upserted,
    };
  } finally {
    await sql.end();
  }
}
