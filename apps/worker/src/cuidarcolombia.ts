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

type Sangre = {
  ciudad?: unknown;
  entidad?: unknown;
  donde?: unknown;
  estado_operacion?: unknown;
  tipos_urgentes?: unknown;
  fuente_titulo?: unknown;
  nivel_fuente?: unknown;
  fecha_revision?: unknown;
};

/**
 * Bancos de sangre, **solo los que están recibiendo**.
 *
 * La fuente marca `estado_operacion`: de los once, siete reciben y tres están `finalizado`. Un
 * banco cerrado no es un sitio a donde mandar a alguien que quiere donar; publicarlo con el mismo
 * marcador que uno abierto le cuesta a esa persona el viaje. Los cerrados no entran.
 */
export function extractBloodPoints(payload: unknown): { city: string; record: Sangre }[] {
  const root = payload as { ayuda?: { sangre?: unknown } };
  const items = Array.isArray(root?.ayuda?.sangre) ? (root.ayuda.sangre as Sangre[]) : [];
  const rows: { city: string; record: Sangre }[] = [];
  for (const record of items) {
    const city = text(record.ciudad);
    if (!city) continue;
    if (text(record.estado_operacion) === "finalizado") continue;
    rows.push({ city, record });
  }
  return rows;
}

export function buildBloodPoint(
  row: { city: string; record: Sangre },
  located: { latitude: number; longitude: number; precision: "calle" | "barrio" },
): MappedAcopio | undefined {
  if (!isWithinColombia(located.latitude, located.longitude)) return undefined;
  const entidad = text(row.record.entidad);
  const donde = text(row.record.donde);
  // La ciudad va en el título, no solo en los metadatos. Sin ella hay tres puntos llamados
  // «Donación de sangre — Cruz Roja — Banco Regional permanente» en tres ciudades distintas, y en
  // una lista son el mismo punto repetido.
  const title = (
    entidad ? `Donación de sangre — ${entidad} · ${row.city}` : `Donación de sangre — ${row.city}`
  ).slice(0, 140);

  const description = [
    donde,
    "Ubicación aproximada a partir de la dirección escrita: confírmala antes de ir.",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" — ")
    .slice(0, 2_000);

  return {
    externalKey: `sangre:${row.city}:${entidad ?? "sin-entidad"}`.slice(0, 200),
    title,
    description,
    latitude: located.latitude,
    longitude: located.longitude,
    precision: located.precision,
    status: STATUS_BY_LEVEL[text(row.record.nivel_fuente) ?? ""] ?? "reported",
    metadata: {
      address: donde,
      city: row.city,
      organization: entidad,
      sourceStatus: text(row.record.estado_operacion),
      needs: list(row.record.tipos_urgentes).slice(0, 40) || undefined,
      reportedAt: text(row.record.fecha_revision),
      subSource: text(row.record.fuente_titulo),
      confidence: located.precision,
    },
  };
}

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

/**
 * Cada cuántos puntos se escribe.
 *
 * La primera versión acumulaba los 118 y escribía al final. Un pase dura ~25 minutos porque el
 * geocodificador va a 4 peticiones por minuto, y **cualquier despliegue reinicia el worker y lo
 * mata**: tres pases seguidos murieron a media corrida y el mapa se quedó en cero mientras la caché
 * ya tenía 44 direcciones resueltas. El trabajo contra Nominatim no se perdía; el resultado sí.
 *
 * Diez es suficientemente pequeño para que una interrupción cueste minutos y no media hora, y
 * suficientemente grande para no escribir en la base cada quince segundos.
 */
const BATCH_SIZE = 10;

async function resolveIncident(sql: Sql, incidentCode: string): Promise<string> {
  const [incident] = await sql<
    { id: string }[]
  >`SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1`;
  if (!incident) throw new Error(`Incident ${incidentCode} does not exist`);
  return incident.id;
}

async function registerSource(sql: Sql) {
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
}

async function upsertBatch(sql: Sql, incidentId: string, points: MappedAcopio[]) {
  let upserted = 0;
  for (const point of points) {
    await sql`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        public_location_precision, status, external_source_id, external_key,
        client_mutation_id, metadata
      ) VALUES (
        ${randomUUID()}, ${incidentId}, 'pmu', null, ${point.title}, ${point.description},
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
  let held = false;
  try {
    // Un solo pase de geocodificación a la vez, en toda la instalación.
    //
    // La política de Nominatim pide «single thread, one machine». Sin cerrojo, el trabajo
    // programado del worker y una corrida a mano pueden solaparse —pasó— y entre los dos duplican
    // el ritmo de peticiones sin que ninguno lo sepa. El cerrojo es consultivo y se suelta solo si
    // el proceso muere, que es exactamente el comportamiento que hace falta aquí.
    const [lock] = await sql<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtext('pulso:geocode')) AS acquired
    `;
    if (!lock?.acquired) {
      // No es «no había nada nuevo»: es «otro pase está trabajando». Se dice, porque un registro
      // que no distingue las dos cosas hace creer que la fuente está quieta cuando no lo está.
      return {
        status: "unchanged" as const,
        skipped: "otro pase de geocodificación está en curso",
        httpStatus: snapshot.httpStatus,
        etag: snapshot.etag,
      };
    }
    held = true;

    const incidentId = await resolveIncident(sql, options.incidentCode);
    await registerSource(sql);

    const geocoder = new Geocoder(sql);
    const skipped = { sinDireccion: 0, sinResultado: 0, otroMunicipio: 0 };
    let batch: MappedAcopio[] = [];
    let mapped = 0;
    let upserted = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      upserted += await upsertBatch(sql, incidentId, batch);
      batch = [];
    };

    // Acopios y bancos de sangre comparten todo el camino: misma geocodificación, mismo
    // guardarraíl, misma escritura por lotes. Solo cambia cómo se arma la ficha, así que se
    // recorren juntos y el geocodificador no distingue entre unos y otros.
    const tasks: {
      address: string | undefined;
      city: string;
      make: (located: {
        latitude: number;
        longitude: number;
        precision: "calle" | "barrio";
      }) => MappedAcopio | undefined;
    }[] = [
      ...rows.map((row) => ({
        address: text(row.point.direccion),
        city: row.city,
        make: (located: { latitude: number; longitude: number; precision: "calle" | "barrio" }) =>
          buildAcopio(row, located),
      })),
      ...extractBloodPoints(snapshot.payload).map((row) => ({
        address: text(row.record.donde),
        city: row.city,
        make: (located: { latitude: number; longitude: number; precision: "calle" | "barrio" }) =>
          buildBloodPoint(row, located),
      })),
    ];

    for (const task of tasks) {
      if (!task.address) {
        skipped.sinDireccion += 1;
        continue;
      }
      const located = await geocoder.locate({ address: task.address, municipality: task.city });
      if (!located.found) {
        // Se cuenta por motivo, no se traga: un punto que desaparece en silencio es peor que uno
        // que falta a la vista, y estos números son los que dicen si el geocodificador sirve.
        if (located.precision === "municipio") skipped.otroMunicipio += 1;
        else skipped.sinResultado += 1;
        continue;
      }
      const point = task.make(located);
      if (!point) continue;
      mapped += 1;
      batch.push(point);
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();

    return {
      status: "stored" as const,
      seen: tasks.length,
      mapped,
      upserted,
      skipped,
      httpStatus: snapshot.httpStatus,
      etag: snapshot.etag,
    };
  } finally {
    // Solo se suelta si se llegó a coger. Soltarlo siempre hacía que Postgres avisara «you don't
    // own a lock of type ExclusiveLock» en cada corrida que se apartó — ruido que enmascara un
    // aviso de verdad el día que lo haya.
    if (held) {
      await sql`SELECT pg_advisory_unlock(hashtext('pulso:geocode'))`.catch(() => undefined);
    }
    await sql.end({ timeout: 5 });
  }
}
