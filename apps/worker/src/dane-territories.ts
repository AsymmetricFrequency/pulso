import type postgres from "postgres";
import type { Sql } from "postgres";
import { contentHash, OfficialSourceStore, openSourceDatabase } from "./official-source-store.js";

export const DANE_MGN_SOURCE = {
  id: "dane-mgn-2023",
  name: "DANE — Marco Geoestadístico Nacional 2023",
  url: "https://geoportal.dane.gov.co/mparcgis/rest/services/MGN2023/Serv_CapasMGN_2023/FeatureServer",
  authority: "official",
  classification: "public_operational",
  collectionMode: "api",
  crawlDelaySeconds: 60,
} as const;

const DEPARTMENT_LAYER = 319;
const MUNICIPALITY_LAYER = 317;

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: postgres.JSONValue[] };
export type DaneTerritory = {
  externalCode: string;
  parentExternalCode?: string;
  type: "department" | "municipality";
  name: string;
  sourceVersion: 2023;
  areaKm2: number;
  municipalityType?: string;
  geometry: Geometry;
};

function queryUrl(layer: number, outFields: string) {
  const url = new URL(`${DANE_MGN_SOURCE.url}/${layer}/query`);
  url.search = new URLSearchParams({
    where: "1=1",
    outFields,
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "5",
    maxAllowableOffset: "0.001",
    f: "geojson",
  }).toString();
  return url;
}

async function fetchLayer(layer: number, outFields: string) {
  const response = await fetch(queryUrl(layer, outFields), {
    headers: {
      Accept: "application/geo+json,application/json",
      "User-Agent": "PULSO-VIDA/0.1 public-emergency-data (+https://pulso.my)",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`DANE layer ${layer} returned HTTP ${response.status}`);
  return response.json();
}

function parseGeometry(value: unknown): Geometry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (
    (candidate.type !== "Polygon" && candidate.type !== "MultiPolygon") ||
    !Array.isArray(candidate.coordinates)
  )
    return undefined;
  const validCoordinates = (item: unknown): item is postgres.JSONValue[] =>
    Array.isArray(item) &&
    item.every((child) =>
      Array.isArray(child)
        ? validCoordinates(child)
        : typeof child === "number" && Number.isFinite(child),
    );
  if (!validCoordinates(candidate.coordinates)) return undefined;
  return { type: candidate.type, coordinates: candidate.coordinates };
}

function featuresFrom(value: unknown) {
  if (!value || typeof value !== "object" || !("features" in value))
    throw new Error("DANE response is not GeoJSON");
  const features = (value as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new Error("DANE response has no features array");
  return features as Array<{ geometry?: unknown; properties?: Record<string, unknown> }>;
}

const field = (properties: Record<string, unknown>, key: string) => {
  const value = properties[key];
  return typeof value === "string" ? value.trim() : "";
};
const numberField = (properties: Record<string, unknown>, key: string) => {
  const value = properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

export function parseDaneTerritories(departmentsPayload: unknown, municipalitiesPayload: unknown) {
  const departments = featuresFrom(departmentsPayload).flatMap((feature): DaneTerritory[] => {
    const properties = feature.properties;
    const geometry = parseGeometry(feature.geometry);
    if (!properties || !geometry) return [];
    const externalCode = field(properties, "DPTO_CCDGO");
    const name = field(properties, "DPTO_CNMBRE");
    if (!/^\d{2}$/.test(externalCode) || !name) return [];
    return [
      {
        externalCode,
        type: "department",
        name,
        sourceVersion: 2023,
        areaKm2: numberField(properties, "DPTO_NAREA"),
        geometry,
      },
    ];
  });
  const departmentCodes = new Set(departments.map((territory) => territory.externalCode));
  const municipalities = featuresFrom(municipalitiesPayload).flatMap((feature): DaneTerritory[] => {
    const properties = feature.properties;
    const geometry = parseGeometry(feature.geometry);
    if (!properties || !geometry) return [];
    const parentExternalCode = field(properties, "DPTO_CCDGO");
    const externalCode = field(properties, "MPIO_CDPMP");
    const name = field(properties, "MPIO_CNMBRE");
    if (!/^\d{5}$/.test(externalCode) || !departmentCodes.has(parentExternalCode) || !name)
      return [];
    return [
      {
        externalCode,
        parentExternalCode,
        type: "municipality",
        name,
        sourceVersion: 2023,
        areaKm2: numberField(properties, "MPIO_NAREA"),
        municipalityType: field(properties, "MPIO_TIPO") || "MUNICIPIO",
        geometry,
      },
    ];
  });
  if (departments.length !== 33)
    throw new Error(`Expected 33 DANE departments, received ${departments.length}`);
  if (municipalities.length < 1100)
    throw new Error(`DANE municipality set is incomplete: ${municipalities.length}`);
  return { departments, municipalities };
}

async function upsertOperationalTerritories(
  sql: Sql,
  incidentCode: string,
  territories: DaneTerritory[],
) {
  const [incident] = await sql<
    Array<{ id: string }>
  >`SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1`;
  if (!incident) throw new Error(`Incident ${incidentCode} does not exist`);
  await sql.begin(async (transaction) => {
    const departmentIds = new Map<string, string>();
    for (const territory of territories.filter((item) => item.type === "department")) {
      const [row] = await transaction<Array<{ id: string }>>`
        INSERT INTO territories (id, incident_id, external_code, territory_type, name, geometry)
        VALUES (gen_random_uuid(), ${incident.id}, ${territory.externalCode}, 'department', ${territory.name},
          ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(territory.geometry)}), 4326))
        ON CONFLICT (incident_id, territory_type, external_code)
          WHERE deleted_at IS NULL AND external_code IS NOT NULL
        DO UPDATE SET name = EXCLUDED.name, geometry = EXCLUDED.geometry, revision = territories.revision + 1, updated_at = now()
        RETURNING id
      `;
      if (!row) throw new Error(`Could not upsert department ${territory.externalCode}`);
      departmentIds.set(territory.externalCode, row.id);
    }
    for (const territory of territories.filter((item) => item.type === "municipality")) {
      const parentId = territory.parentExternalCode
        ? departmentIds.get(territory.parentExternalCode)
        : undefined;
      if (!parentId)
        throw new Error(`Missing department for municipality ${territory.externalCode}`);
      await transaction`
        INSERT INTO territories (id, incident_id, parent_id, external_code, territory_type, name, geometry)
        VALUES (gen_random_uuid(), ${incident.id}, ${parentId}, ${territory.externalCode}, 'municipality', ${territory.name},
          ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(territory.geometry)}), 4326))
        ON CONFLICT (incident_id, territory_type, external_code)
          WHERE deleted_at IS NULL AND external_code IS NOT NULL
        DO UPDATE SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, geometry = EXCLUDED.geometry,
          revision = territories.revision + 1, updated_at = now()
      `;
    }
  });
}

export async function runDaneTerritoryIngestion(options: {
  databaseUrl?: string;
  incidentCode?: string;
}) {
  const [departmentsPayload, municipalitiesPayload] = await Promise.all([
    fetchLayer(DEPARTMENT_LAYER, "DPTO_CCDGO,DPTO_CNMBRE,DPTO_NANO,DPTO_NAREA"),
    fetchLayer(
      MUNICIPALITY_LAYER,
      "DPTO_CCDGO,MPIO_CCDGO,MPIO_CDPMP,DPTO_CNMBRE,MPIO_CNMBRE,MPIO_NANO,MPIO_NAREA,MPIO_TIPO",
    ),
  ]);
  const { departments, municipalities } = parseDaneTerritories(
    departmentsPayload,
    municipalitiesPayload,
  );
  const territories = [...departments, ...municipalities];
  const sql = openSourceDatabase(options.databaseUrl);
  try {
    const records = territories.map((territory) => ({
      externalKey: `territory:${territory.type}:${territory.externalCode}`,
      recordType: "territory" as const,
      payload: { ...territory },
    }));
    const runId = await (sql ? new OfficialSourceStore(sql) : undefined)?.save(DANE_MGN_SOURCE, {
      observedAt: new Date().toISOString(),
      contentHash: contentHash(territories),
      records,
    });
    if (sql && options.incidentCode)
      await upsertOperationalTerritories(sql, options.incidentCode, territories);
    return {
      status: options.databaseUrl ? ("stored" as const) : ("preview" as const),
      runId,
      departments: departments.length,
      municipalities: municipalities.length,
      operationalTerritoriesUpdated: Boolean(sql && options.incidentCode),
    };
  } finally {
    await sql?.end();
  }
}
