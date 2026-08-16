import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * Adaptador de USGS ShakeMap.
 *
 * Aporta lo que ninguna otra fuente de Pulso da hoy: **dónde sacudió más fuerte**. El SGC publica
 * los sismos —dónde y de qué magnitud— pero no el campo de sacudida sobre el territorio, y sin eso
 * el mapa no puede decir qué municipios estuvieron expuestos a un movimiento severo.
 *
 * Importante y deliberado: la intensidad **no es daño**. Un municipio con MMI 7 recibió una
 * sacudida muy fuerte, lo que no dice cuántas casas se cayeron —eso depende de cómo estén
 * construidas—. La capa se publica como intensidad y en ningún caso se presenta como afectación
 * observada: para eso hacen falta las evaluaciones de campo que hoy siguen en cero.
 */
export const USGS_SHAKEMAP_SOURCE = {
  id: "usgs-shakemap",
  name: "USGS — ShakeMap (intensidad sísmica modelada)",
  url: "https://earthquake.usgs.gov/fdsnws/event/1/query",
  authority: "official",
  classification: "public_operational",
  collectionMode: "api",
  crawlDelaySeconds: 60,
} as const;

export const USGS_PARSER_VERSION = "usgs-shakemap/1";

/** Escala de Mercalli modificada, con el rótulo que el propio USGS usa para cada grado. */
export function mmiLabel(value: number): string {
  if (value < 1.5) return "No percibido";
  if (value < 2.5) return "Muy débil";
  if (value < 3.5) return "Débil";
  if (value < 4.5) return "Leve";
  if (value < 5.5) return "Moderado";
  if (value < 6.5) return "Fuerte";
  if (value < 7.5) return "Muy fuerte";
  if (value < 8.5) return "Severo";
  if (value < 9.5) return "Violento";
  return "Extremo";
}

type UsgsEventResponse = {
  properties?: {
    mag?: number;
    place?: string;
    time?: number;
    products?: Record<string, Array<{ contents?: Record<string, { url?: string }> }>>;
  };
  geometry?: { coordinates?: number[] };
};

export type UsgsEvent = {
  eventId: string;
  magnitude: number | null;
  place: string | null;
  occurredAt: string | null;
  longitude: number | null;
  latitude: number | null;
  depthKm: number | null;
  coverageUrl: string | null;
};

/**
 * El USGS revisa un evento durante días: la URL del ShakeMap lleva la marca de tiempo de la
 * versión, así que se resuelve desde el evento en cada corrida en vez de fijarla en el código.
 * Congelarla dejaría a Pulso publicando una versión vieja del modelo sin enterarse.
 */
export function parseUsgsEvent(eventId: string, payload: unknown): UsgsEvent {
  const response = payload as UsgsEventResponse;
  const properties = response.properties ?? {};
  const coordinates = response.geometry?.coordinates ?? [];
  const shakemap = properties.products?.shakemap?.[0];
  const contents = shakemap?.contents ?? {};
  const coverageUrl =
    contents["download/coverage_mmi_low_res.covjson"]?.url ??
    contents["download/coverage_mmi_medium_res.covjson"]?.url ??
    null;

  return {
    eventId,
    magnitude: typeof properties.mag === "number" ? properties.mag : null,
    place: typeof properties.place === "string" ? properties.place : null,
    occurredAt:
      typeof properties.time === "number" ? new Date(properties.time).toISOString() : null,
    longitude: typeof coordinates[0] === "number" ? coordinates[0] : null,
    latitude: typeof coordinates[1] === "number" ? coordinates[1] : null,
    depthKm: typeof coordinates[2] === "number" ? coordinates[2] : null,
    coverageUrl,
  };
}

export type MmiCell = { lon: number; lat: number; mmi: number };

type CoverageJson = {
  domain?: {
    axes?: {
      x?: { start?: number; stop?: number; num?: number; values?: number[] };
      y?: { start?: number; stop?: number; num?: number; values?: number[] };
    };
  };
  ranges?: Record<
    string,
    { shape?: number[]; axisNames?: string[]; values?: Array<number | null> }
  >;
};

const axisValues = (axis: { start?: number; stop?: number; num?: number; values?: number[] }) => {
  if (Array.isArray(axis.values)) return axis.values;
  const { start, stop, num } = axis;
  if (typeof start !== "number" || typeof stop !== "number" || !num || num < 1) return [];
  if (num === 1) return [start];
  const step = (stop - start) / (num - 1);
  return Array.from({ length: num }, (_, index) => start + step * index);
};

/**
 * Convierte la malla CoverageJSON en celdas sueltas.
 *
 * Los ejes vienen comprimidos como `start`/`stop`/`num` en vez de una lista, y los valores llegan
 * aplanados en el orden que declara `axisNames`. Respetar ese orden es lo único que separa una
 * malla correcta de una espejada, que asignaría la sacudida del Pacífico a los Llanos.
 */
export function parseMmiCoverage(payload: unknown): MmiCell[] {
  const coverage = payload as CoverageJson;
  const xAxis = coverage.domain?.axes?.x;
  const yAxis = coverage.domain?.axes?.y;
  const range = coverage.ranges?.MMI ?? coverage.ranges?.mmi;
  if (!xAxis || !yAxis || !range?.values) return [];

  const xs = axisValues(xAxis);
  const ys = axisValues(yAxis);
  if (xs.length === 0 || ys.length === 0) return [];

  const axisNames = range.axisNames ?? ["y", "x"];
  const yFirst = axisNames[0] === "y";
  const cells: MmiCell[] = [];

  for (let outer = 0; outer < (yFirst ? ys.length : xs.length); outer += 1) {
    for (let inner = 0; inner < (yFirst ? xs.length : ys.length); inner += 1) {
      const index = outer * (yFirst ? xs.length : ys.length) + inner;
      const value = range.values[index];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const lat = yFirst ? ys[outer] : ys[inner];
      const lon = yFirst ? xs[inner] : xs[outer];
      if (typeof lat !== "number" || typeof lon !== "number") continue;
      cells.push({ lon, lat, mmi: value });
    }
  }
  return cells;
}

const fetchJson = async (url: string, label: string) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PULSO/0.1 public-emergency-data (+https://pulso.my)",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
};

export const fetchUsgsEvent = async (eventId: string) =>
  fetchJson(
    `${USGS_SHAKEMAP_SOURCE.url}?eventid=${encodeURIComponent(eventId)}&format=geojson`,
    "USGS event feed",
  );

export const fetchMmiCoverage = async (url: string) => fetchJson(url, "USGS ShakeMap coverage");

const contentHashOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function runUsgsShakingIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
  eventId?: string;
}) {
  const eventId = options.eventId ?? "us6000tjl2";
  const event = parseUsgsEvent(eventId, await fetchUsgsEvent(eventId));
  if (!event.coverageUrl) {
    throw new Error("USGS event has no ShakeMap MMI coverage yet");
  }
  const coveragePayload = await fetchMmiCoverage(event.coverageUrl);
  const cells = parseMmiCoverage(coveragePayload);

  if (!options.databaseUrl) {
    return {
      status: "preview" as const,
      seen: cells.length,
      event,
      maxMmi: cells.reduce((max, cell) => Math.max(max, cell.mmi), 0),
    };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const [incident] = await sql<{ id: string }[]>`
      SELECT id FROM incidents WHERE code = ${options.incidentCode} AND deleted_at IS NULL LIMIT 1
    `;
    if (!incident) throw new Error(`Incident ${options.incidentCode} does not exist`);

    await sql`
      INSERT INTO external_sources (
        id, display_name, source_url, authority, data_classification,
        collection_mode, crawl_delay_seconds
      ) VALUES (
        ${USGS_SHAKEMAP_SOURCE.id}, ${USGS_SHAKEMAP_SOURCE.name}, ${USGS_SHAKEMAP_SOURCE.url},
        ${USGS_SHAKEMAP_SOURCE.authority}, ${USGS_SHAKEMAP_SOURCE.classification},
        ${USGS_SHAKEMAP_SOURCE.collectionMode}, ${USGS_SHAKEMAP_SOURCE.crawlDelaySeconds}
      )
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name, active = true, updated_at = now()
    `;

    const provenanceId = randomUUID();
    const contentHash = contentHashOf(coveragePayload);
    await sql`
      INSERT INTO provenance_records (
        id, source_id, source_system, source_reference, source_url, content_hash,
        parser_version, retrieved_at, published_at, normalization_status, correlation_id
      ) VALUES (
        ${provenanceId}, ${USGS_SHAKEMAP_SOURCE.id}, 'usgs-shakemap', ${eventId},
        ${event.coverageUrl}, ${contentHash}, ${USGS_PARSER_VERSION}, now(),
        ${event.occurredAt}, 'normalized', ${randomUUID()}
      )
      ON CONFLICT (source_id, source_reference, content_hash) DO UPDATE SET retrieved_at = now()
    `;
    const [provenance] = await sql<{ id: string }[]>`
      SELECT id FROM provenance_records
      WHERE source_id = ${USGS_SHAKEMAP_SOURCE.id} AND source_reference = ${eventId}
        AND content_hash = ${contentHash}
      LIMIT 1
    `;

    // El cruce se hace en PostGIS y no en JavaScript: son 29.000 celdas contra 1.154 polígonos, y
    // el índice GiST de `territories` resuelve en el motor lo que en memoria sería un producto
    // cartesiano.
    const lons = cells.map((cell) => cell.lon);
    const lats = cells.map((cell) => cell.lat);
    const values = cells.map((cell) => cell.mmi);

    const matched = await sql<
      { territory_id: string; mmi_max: string; mmi_mean: string; cells: string }[]
    >`
      WITH grid AS (
        SELECT * FROM unnest(
          ${sql.array(lons)}::float8[],
          ${sql.array(lats)}::float8[],
          ${sql.array(values)}::float8[]
        ) AS cell(lon, lat, mmi)
      )
      SELECT t.id AS territory_id,
             max(g.mmi)::text AS mmi_max,
             avg(g.mmi)::text AS mmi_mean,
             count(*)::text AS cells
      FROM territories t
      JOIN grid g
        ON ST_Contains(t.geometry, ST_SetSRID(ST_MakePoint(g.lon, g.lat), 4326))
      WHERE t.incident_id = ${incident.id} AND t.deleted_at IS NULL
      GROUP BY t.id
    `;

    for (const row of matched) {
      const max = Number(row.mmi_max);
      await sql`
        INSERT INTO territory_shaking (
          id, incident_id, territory_id, source_id, mmi_max, mmi_mean, mmi_label,
          grid_cells, provenance_id, computed_at
        ) VALUES (
          ${randomUUID()}, ${incident.id}, ${row.territory_id}, ${USGS_SHAKEMAP_SOURCE.id},
          ${max.toFixed(1)}, ${Number(row.mmi_mean).toFixed(1)}, ${mmiLabel(max)},
          ${Number(row.cells)}, ${provenance?.id ?? null}, now()
        )
        ON CONFLICT (incident_id, territory_id, source_id) DO UPDATE SET
          mmi_max = EXCLUDED.mmi_max,
          mmi_mean = EXCLUDED.mmi_mean,
          mmi_label = EXCLUDED.mmi_label,
          grid_cells = EXCLUDED.grid_cells,
          provenance_id = EXCLUDED.provenance_id,
          computed_at = now()
      `;
    }

    return {
      status: "stored" as const,
      seen: cells.length,
      upserted: matched.length,
      maxMmi: cells.reduce((max, cell) => Math.max(max, cell.mmi), 0),
      event: { magnitude: event.magnitude, place: event.place },
    };
  } finally {
    await sql.end();
  }
}
