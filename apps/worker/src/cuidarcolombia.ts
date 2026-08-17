import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";
import { Geocoder } from "./geocode.js";

export const CUIDARCOLOMBIA_SOURCE = {
  id: "cuidarcolombia-acopios",
  name: "Cuidar a Colombia — Centros de acopio verificados",
  url: "https://cuidarcolombia.vercel.app/data/app.json",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  crawlDelaySeconds: 1_800,
} as const;

/**
 * De dónde salen los datos y por qué hay que geocodificarlos.
 *
 * `/data/app.json`: fichero estático, `robots.txt` en `Allow: /`, `access-control-allow-origin: *`
 * y ETag. Su propia web pide el mismo. Igual que mapadelterremoto — publicado, no deducido.
 *
 * Lo que **no** trae es coordenada: 118 puntos de acopio con dirección escrita y ningún `lat`/`lon`.
 * Las únicas coordenadas del fichero son 32 centroides de ciudad, que es lo que usan para su propio
 * mapa. Clavar 118 acopios en 32 centros de ciudad sería inventar ubicaciones, así que cada punto
 * pasa por el geocodificador y **entra solo si resuelve dentro del municipio declarado**.
 *
 * Aporta lo que ninguna otra fuente nuestra tiene: acopios fuera de Cali y Pereira —Bogotá,
 * Medellín, Cartagena, Barranquilla, Cúcuta, Bucaramanga— con horario y con qué sí y qué no donar.
 */

type Punto = { nombre?: unknown; direccion?: unknown; horario?: unknown };
type Acopio = {
  ciudad?: unknown;
  entidad?: unknown;
  puntos?: unknown;
  que_donar?: unknown;
  que_no_donar?: unknown;
  fuente_titulo?: unknown;
  fuente_url?: unknown;
  nivel_fuente?: unknown;
  fecha?: unknown;
};

export type MappedAcopio = {
  externalKey: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  /** `calle` o `barrio`: nunca se afirma más precisión de la que el geocodificador dio. */
  precision: "calle" | "barrio";
  status: "reported" | "corroborated";
  metadata: CommunityReportMetadata;
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];

/** Su `nivel_fuente` es el mismo juicio que nuestro estado de revisión, con otro nombre. */
const STATUS_BY_LEVEL: Record<string, "reported" | "corroborated"> = {
  fuente_oficial: "corroborated",
  fuente_secundaria: "reported",
};

export function extractAcopioPoints(payload: unknown): {
  city: string;
  entity: string | undefined;
  point: Punto;
  acopio: Acopio;
}[] {
  const root = payload as { ayuda?: { acopios?: unknown } };
  const acopios = Array.isArray(root?.ayuda?.acopios) ? (root.ayuda.acopios as Acopio[]) : [];
  const rows: { city: string; entity: string | undefined; point: Punto; acopio: Acopio }[] = [];
  for (const acopio of acopios) {
    const city = text(acopio.ciudad);
    if (!city) continue;
    for (const point of Array.isArray(acopio.puntos) ? (acopio.puntos as Punto[]) : []) {
      rows.push({ city, entity: text(acopio.entidad), point, acopio });
    }
  }
  return rows;
}

/**
 * Construye la ficha a partir de un punto ya ubicado. La geocodificación se hace fuera porque es
 * asíncrona y con límite de ritmo; aquí solo se arma el registro, que es lo que se puede probar.
 */
export function buildAcopio(
  row: { city: string; entity: string | undefined; point: Punto; acopio: Acopio },
  located: { latitude: number; longitude: number; precision: "calle" | "barrio" },
): MappedAcopio | undefined {
  if (!isWithinColombia(located.latitude, located.longitude)) return undefined;

  const nombre = text(row.point.nombre);
  const direccion = text(row.point.direccion);
  const title = (nombre ?? `Centro de acopio — ${row.city}`).slice(0, 140);
  if (title.length < 3) return undefined;

  const donar = list(row.acopio.que_donar);
  const noDonar = list(row.acopio.que_no_donar);

  const description = [
    row.entity,
    direccion ? `Dirección: ${direccion}` : undefined,
    text(row.point.horario),
    noDonar.length > 0 ? `No recibe: ${noDonar.join(", ")}` : undefined,
    // Se dice en el propio texto porque el marcador está donde el geocodificador puso la calle, y
    // eso puede quedar a cuadras del portal. Quien va a desplazarse tiene que leer la dirección.
    "Ubicación aproximada a partir de la dirección escrita: confírmala antes de ir.",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" — ")
    .slice(0, 2_000);

  const externalKey = `${row.city}:${nombre ?? direccion ?? "sin-nombre"}`.slice(0, 200);

  const metadata: CommunityReportMetadata = {
    address: direccion,
    city: row.city,
    schedule: text(row.point.horario),
    organization: row.entity,
    needs: donar.length > 0 ? donar.slice(0, 40) : undefined,
    sourceStatus: text(row.acopio.nivel_fuente),
    reportedAt: text(row.acopio.fecha),
    subSource: text(row.acopio.fuente_titulo),
    confidence: located.precision,
  };

  return {
    externalKey,
    title,
    description: description || null,
    latitude: located.latitude,
    longitude: located.longitude,
    precision: located.precision,
    status: STATUS_BY_LEVEL[text(row.acopio.nivel_fuente) ?? ""] ?? "reported",
    metadata,
  };
}

export async function fetchCuidarColombiaSnapshot(previousEtag?: string | null) {
  const response = await fetch(CUIDARCOLOMBIA_SOURCE.url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PULSO/0.1 public-emergency-data (+https://pulso.my)",
      ...(previousEtag ? { "If-None-Match": previousEtag } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const etag = response.headers.get("etag");
  if (response.status === 304)
    return { changed: false as const, httpStatus: 304, etag: previousEtag ?? etag };
  if (!response.ok) throw new Error(`Cuidar a Colombia returned HTTP ${response.status}`);
  return {
    changed: true as const,
    httpStatus: response.status,
    etag,
    payload: await response.json(),
  };
}

async function upsert(sql: Sql, incidentCode: string, points: MappedAcopio[]) {
  const [incident] = await sql<
    { id: string }[]
  >`SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1`;
  if (!incident) throw new Error(`Incident ${incidentCode} does not exist`);

  await sql`
    INSERT INTO external_sources (
      id, display_name, source_url, authority, data_classification,
      collection_mode, crawl_delay_seconds
    ) VALUES (
      ${CUIDARCOLOMBIA_SOURCE.id}, ${CUIDARCOLOMBIA_SOURCE.name}, ${CUIDARCOLOMBIA_SOURCE.url},
      ${CUIDARCOLOMBIA_SOURCE.authority}, ${CUIDARCOLOMBIA_SOURCE.classification},
      ${CUIDARCOLOMBIA_SOURCE.collectionMode}, ${CUIDARCOLOMBIA_SOURCE.crawlDelaySeconds}
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name, source_url = EXCLUDED.source_url,
      active = true, updated_at = now()
  `;

  let upserted = 0;
  for (const point of points) {
    await sql`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        public_location_precision, status, external_source_id, external_key,
        client_mutation_id, metadata
      ) VALUES (
        ${randomUUID()}, ${incident.id}, 'pmu', null, ${point.title}, ${point.description},
        ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326),
        'geocoded', ${point.status}, ${CUIDARCOLOMBIA_SOURCE.id}, ${point.externalKey},
        ${randomUUID()}, ${sql.json(point.metadata)}
      )
      ON CONFLICT (external_source_id, external_key) WHERE external_source_id IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location = EXCLUDED.location,
        public_location_precision = EXCLUDED.public_location_precision,
        metadata = EXCLUDED.metadata,
        status = CASE WHEN community_reports.status = 'rejected' THEN community_reports.status
          ELSE EXCLUDED.status END,
        updated_at = now()
    `;
    upserted += 1;
  }
  return upserted;
}

export async function runCuidarColombiaIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
  previousEtag?: string | null;
}) {
  const snapshot = await fetchCuidarColombiaSnapshot(options.previousEtag);
  if (!snapshot.changed) {
    return { status: "unchanged" as const, httpStatus: 304, etag: snapshot.etag };
  }

  const rows = extractAcopioPoints(snapshot.payload);
  if (!options.databaseUrl) {
    return { status: "preview" as const, seen: rows.length, etag: snapshot.etag };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const geocoder = new Geocoder(sql);
    const points: MappedAcopio[] = [];
    const skipped = { sinDireccion: 0, sinResultado: 0, otroMunicipio: 0 };

    for (const row of rows) {
      const direccion = text(row.point.direccion);
      if (!direccion) {
        skipped.sinDireccion += 1;
        continue;
      }
      const located = await geocoder.locate({ address: direccion, municipality: row.city });
      if (!located.found) {
        // Se cuenta por motivo, no se traga: un punto que desaparece en silencio es peor que uno
        // que falta a la vista, y estos números son los que dicen si el geocodificador sirve.
        if (located.precision === "municipio") skipped.otroMunicipio += 1;
        else skipped.sinResultado += 1;
        continue;
      }
      const mapped = buildAcopio(row, located);
      if (mapped) points.push(mapped);
    }

    const upserted = await upsert(sql, options.incidentCode, points);
    return {
      status: "stored" as const,
      seen: rows.length,
      mapped: points.length,
      upserted,
      skipped,
      httpStatus: snapshot.httpStatus,
      etag: snapshot.etag,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
