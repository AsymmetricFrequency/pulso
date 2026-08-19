import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";

/**
 * Carga la evaluación de daño por satélite del HDX.
 *
 * **Lee de archivos versionados en el repositorio, no de la red.** Los originales pesan entre 10 y
 * 77 MB e incluyen las 396.053 huellas de edificación de Cali y Pereira, dañadas o no; lo que aquí
 * se guarda son las 1.627 señaladas, filtradas y con la etiqueta original al lado. Que el recorte
 * esté versionado significa que se puede ver exactamente qué se descartó y volver a hacerlo — que
 * es la promesa del proyecto sobre cualquier cifra que publica.
 *
 * Es un conjunto publicado una vez, no un flujo: se ingiere cuando la fuente publica una revisión,
 * no cada media hora.
 */

const DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/reference/remote-damage",
);

const DAMAGE_FILES = [
  "unosat-anserma.geojson",
  "unosat-manizales.geojson",
  "unosat-viterbo.geojson",
  "microsoft-cali.geojson",
  "microsoft-pereira.geojson",
] as const;

type Meta = {
  source: "unosat" | "microsoft_ai_for_good";
  sourceLabel: string;
  dataset: string;
  sourceUrl: string;
  method: "analista" | "modelo";
  sensor: string;
  imageryDate: string;
  municipality: string;
  divipola: string;
  license: string;
  attribution: string;
};

type DamageFeature = {
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    externalId: string;
    damageLevel: "dano" | "posible_dano" | "sin_clasificar";
    rawLabel: string | null;
    fieldValidated: boolean;
    rawEventCode: string | null;
    modelScore: number | null;
  };
};

type AreaFeature = {
  geometry: { type: string; coordinates: postgres.JSONValue[] };
  properties: {
    externalId: string;
    source: "unosat" | "microsoft_ai_for_good";
    divipola: string;
    imageryDate: string;
  };
};

export type RemoteDamageResult = {
  assessments: number;
  areas: number;
  byMunicipality: Array<{ municipality: string; source: string; count: number }>;
  unmatchedTerritories: string[];
};

async function readCollection<T>(file: string): Promise<{ pulso?: Meta; features: T[] }> {
  return JSON.parse(await readFile(join(DATA_DIR, file), "utf8"));
}

export async function runRemoteDamageIngestion(
  options: { databaseUrl?: string; incidentCode?: string } = {},
): Promise<RemoteDamageResult> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const incidentCode = options.incidentCode ?? "colombia-2026";

  const sql = postgres(databaseUrl, { max: 2 });
  try {
    return await ingest(sql, incidentCode);
  } finally {
    await sql.end();
  }
}

async function ingest(sql: Sql, incidentCode: string): Promise<RemoteDamageResult> {
  const [incident] = await sql<{ id: string }[]>`
    SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1
  `;
  if (!incident) throw new Error(`Incident ${incidentCode} not found`);

  const byMunicipality: RemoteDamageResult["byMunicipality"] = [];
  const unmatchedTerritories: string[] = [];
  let assessments = 0;

  for (const file of DAMAGE_FILES) {
    const collection = await readCollection<DamageFeature>(file);
    const meta = collection.pulso;
    if (!meta) throw new Error(`${file} has no pulso metadata block`);

    // El territorio se resuelve por código DIVIPOLA, no por el nombre del municipio: «Cali» y
    // «Santiago de Cali» son el mismo sitio y el código no se presta a eso.
    const [territory] = await sql<{ id: string }[]>`
      SELECT id FROM territories WHERE external_code = ${meta.divipola} LIMIT 1
    `;
    // Un territorio que no casa no detiene la ingesta: la fila entra sin él y el municipio se
    // reporta. Perder 154 daños de Viterbo porque falta una fila de territorios sería peor.
    if (!territory) unmatchedTerritories.push(`${meta.municipality} (${meta.divipola})`);

    await sql.begin(async (tx) => {
      for (const feature of collection.features) {
        const [lon, lat] = feature.geometry.coordinates;
        const p = feature.properties;
        await tx`
          INSERT INTO remote_damage_assessments (
            id, incident_id, territory_id, source, source_dataset, external_id,
            method, sensor, imagery_date, damage_level, raw_damage_label, model_score,
            field_validated, raw_event_code, location, license, attribution, source_url
          ) VALUES (
            gen_random_uuid(), ${incident.id}, ${territory?.id ?? null},
            ${meta.source}, ${meta.dataset}, ${p.externalId},
            ${meta.method}, ${meta.sensor}, ${meta.imageryDate},
            ${p.damageLevel}, ${p.rawLabel}, ${p.modelScore},
            ${p.fieldValidated}, ${p.rawEventCode},
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
            ${meta.license}, ${meta.attribution}, ${meta.sourceUrl}
          )
          ON CONFLICT (source_dataset, external_id) DO UPDATE SET
            damage_level = EXCLUDED.damage_level,
            raw_damage_label = EXCLUDED.raw_damage_label,
            model_score = EXCLUDED.model_score,
            territory_id = EXCLUDED.territory_id,
            location = EXCLUDED.location,
            attribution = EXCLUDED.attribution,
            updated_at = now()
        `;
      }
    });

    assessments += collection.features.length;
    byMunicipality.push({
      municipality: meta.municipality,
      source: meta.source,
      count: collection.features.length,
    });
  }

  // Las áreas analizadas. Van en la misma corrida porque sin ellas los puntos mienten por omisión:
  // un punto solo significa «esto es lo único que se pudo mirar», no «esto es lo único que hay».
  const areaCollection = await readCollection<AreaFeature>("analysed-areas.geojson");
  await sql.begin(async (tx) => {
    for (const feature of areaCollection.features) {
      const p = feature.properties;
      const [territory] = await tx<{ id: string }[]>`
        SELECT id FROM territories WHERE external_code = ${p.divipola} LIMIT 1
      `;
      await tx`
        INSERT INTO remote_damage_analysed_areas (
          id, incident_id, territory_id, source, external_id, imagery_date, area
        ) VALUES (
          gen_random_uuid(), ${incident.id}, ${territory?.id ?? null},
          ${p.source}, ${p.externalId}, ${p.imageryDate},
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(feature.geometry)}), 4326))
        )
        ON CONFLICT (source, external_id) DO UPDATE SET
          area = EXCLUDED.area,
          territory_id = EXCLUDED.territory_id
      `;
    }
  });

  return {
    assessments,
    areas: areaCollection.features.length,
    byMunicipality,
    unmatchedTerritories,
  };
}
