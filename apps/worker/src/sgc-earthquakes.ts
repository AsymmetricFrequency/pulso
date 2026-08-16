import { contentHash, OfficialSourceStore, openSourceDatabase } from "./official-source-store.js";

export const SGC_EARTHQUAKE_SOURCE = {
  id: "sgc-realtime-earthquakes",
  name: "Servicio Geológico Colombiano — Sismos últimos cinco días",
  url: "https://archive.sgc.gov.co/feed/v1.0.1/summary/five_days_all.json",
  authority: "official",
  classification: "public_operational",
  collectionMode: "api",
  crawlDelaySeconds: 60,
} as const;

type UnknownFeature = {
  id?: unknown;
  type?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

export type SgcEarthquake = {
  id: string;
  magnitude: number;
  magnitudeType: string;
  depthKm: number;
  latitude: number;
  longitude: number;
  localTime: string;
  utcTime: string;
  updatedAt: string;
  place: string;
  status: "manual" | "automatic" | "unknown";
  agency: "SGC";
  closerTowns: string;
  feltReports: number;
  instrumentalIntensity: number;
  communityIntensity: number;
};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function parseSgcEarthquakes(payload: unknown, sinceLocalTime: string) {
  if (!payload || typeof payload !== "object" || !("features" in payload)) {
    throw new Error("SGC feed is not a FeatureCollection");
  }
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new Error("SGC feed has no features array");
  const since = new Date(sinceLocalTime).getTime();
  if (!Number.isFinite(since)) throw new Error("Invalid SGC ingestion start time");

  return features.flatMap((raw): SgcEarthquake[] => {
    const feature = raw as UnknownFeature;
    const properties = feature.properties;
    const coordinates = feature.geometry?.coordinates;
    if (
      typeof feature.id !== "string" ||
      feature.geometry?.type !== "Point" ||
      !Array.isArray(coordinates) ||
      !properties ||
      properties.type !== "earthquake" ||
      properties.agency !== "SGC"
    ) {
      return [];
    }
    // El feed oficial usa [latitud, longitud, profundidad], no el orden GeoJSON estándar.
    const latitude = finite(coordinates[0]);
    const longitude = finite(coordinates[1]);
    const depthKm = finite(coordinates[2]);
    const magnitude = finite(properties.mag);
    const localTime = text(properties.localTime);
    const eventTime = new Date(`${localTime.replace(" ", "T")}-05:00`).getTime();
    if (
      latitude === undefined ||
      longitude === undefined ||
      depthKm === undefined ||
      magnitude === undefined ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(eventTime) ||
      eventTime < since
    ) {
      return [];
    }
    const rawStatus = text(properties.status).toLowerCase();
    return [
      {
        id: feature.id,
        magnitude,
        magnitudeType: text(properties.magType, "unknown"),
        depthKm,
        latitude,
        longitude,
        localTime,
        utcTime: text(properties.utcTime),
        updatedAt: text(properties.updated),
        place: text(properties.place, "Ubicación no publicada"),
        status: rawStatus === "manual" || rawStatus === "automatic" ? rawStatus : "unknown",
        agency: "SGC",
        closerTowns: text(properties.closerTowns),
        feltReports: finite(properties.felt) ?? 0,
        instrumentalIntensity: finite(properties.mmi) ?? 0,
        communityIntensity: finite(properties.cdi) ?? 0,
      },
    ];
  });
}

export async function fetchSgcEarthquakes(options: { etag?: string; lastModified?: string } = {}) {
  const headers = new Headers({
    Accept: "application/json",
    "User-Agent": "PULSO-VIDA/0.1 public-emergency-data (+https://pulso.my)",
  });
  if (options.etag) headers.set("If-None-Match", options.etag);
  if (options.lastModified) headers.set("If-Modified-Since", options.lastModified);
  const response = await fetch(SGC_EARTHQUAKE_SOURCE.url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 304)
    return { status: 304 as const, etag: options.etag, lastModified: options.lastModified };
  if (!response.ok) throw new Error(`SGC feed returned HTTP ${response.status}`);
  return {
    status: 200 as const,
    payload: await response.json(),
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
  };
}

export async function runSgcEarthquakeIngestion(options: {
  databaseUrl?: string;
  since: string;
  /** Corrida ya abierta por el orquestador; sin ella la fuente abre la suya. */
  runId?: string;
}) {
  const sql = openSourceDatabase(options.databaseUrl);
  try {
    const store = sql ? new OfficialSourceStore(sql) : undefined;
    const previous = await store?.lastSuccessfulRun(SGC_EARTHQUAKE_SOURCE.id);
    const response = await fetchSgcEarthquakes({
      ...(previous?.etag ? { etag: previous.etag } : {}),
      ...(previous?.last_modified ? { lastModified: previous.last_modified } : {}),
    });
    if (response.status === 304) {
      await store?.saveUnchanged(
        SGC_EARTHQUAKE_SOURCE,
        {
          ...(response.etag ? { etag: response.etag } : {}),
          ...(response.lastModified ? { lastModified: response.lastModified } : {}),
        },
        options.runId ? { runId: options.runId } : {},
      );
      return { status: "unchanged" as const, count: 0 };
    }
    const events = parseSgcEarthquakes(response.payload, options.since);
    const observedAt = new Date().toISOString();
    const records = events.map((event) => ({
      externalKey: `earthquake:${event.id}`,
      recordType: "seismic_event" as const,
      payload: { ...event },
    }));
    const runId = await store?.save(
      SGC_EARTHQUAKE_SOURCE,
      {
        observedAt,
        contentHash: contentHash(events),
        records,
        ...(response.etag ? { etag: response.etag } : {}),
        ...(response.lastModified ? { lastModified: response.lastModified } : {}),
      },
      options.runId ? { runId: options.runId } : {},
    );
    return {
      status: options.databaseUrl ? ("stored" as const) : ("preview" as const),
      count: events.length,
      runId,
      events,
    };
  } finally {
    await sql?.end();
  }
}
