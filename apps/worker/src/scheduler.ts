import postgres from "postgres";
import { AYUDAS_PEREIRA_SOURCE, runAyudasPereiraIngestion } from "./ayudaspereira.js";
import { CALI_OFFICIAL_SOURCE, runCaliOfficialIngestion } from "./cali-official.js";
import { CONTEMOS_SOURCE, runContemosIngestion } from "./contemos.js";
import { CUIDARCOLOMBIA_SOURCE, runCuidarColombiaIngestion } from "./cuidarcolombia.js";
import { DANE_MGN_SOURCE, runDaneTerritoryIngestion } from "./dane-territories.js";
import { GRAVITAS_SOURCE, runGravitasIngestion } from "./gravitas.js";
import {
  completeIngestionRun,
  etagFromResult,
  httpStatusFromError,
  httpStatusFromResult,
  type IngestionSourceDefinition,
  lastEtagForSource,
  outcomeFromResult,
  recordsSeenFromResult,
  startIngestionRun,
} from "./ingestion-run-log.js";
import { MAPADELTERREMOTO_SOURCE, runMapaDelTerremotoIngestion } from "./mapadelterremoto.js";
import { runPublishSituationReport } from "./publish-situation-report.js";
import { REDCALIAYUDA_SOURCE, runRedCaliAyudaIngestion } from "./redcaliayuda.js";
import {
  REDCALIAYUDA_ACOPIO_SOURCE,
  runRedCaliAyudaAcopioIngestion,
} from "./redcaliayuda-acopio.js";
import { runSecopIngestion, SECOP_SOURCE } from "./secop.js";
import { runSgcEarthquakeIngestion, SGC_EARTHQUAKE_SOURCE } from "./sgc-earthquakes.js";
import { runTerremotoColombiaIngestion, TERREMOTOCOLOMBIA_SOURCE } from "./terremotocolombia.js";
import { runUsgsShakingIngestion, USGS_SHAKEMAP_SOURCE } from "./usgs.js";

export type IngestionSourceName =
  | "sgc"
  | "cali"
  | "dane"
  | "contemos"
  | "gravitas"
  | "ayudaspereira"
  | "terremotocolombia"
  | "redcaliayuda"
  | "redcaliayuda-acopio"
  | "secop"
  | "usgs"
  | "mapadelterremoto"
  | "cuidarcolombia"
  | "publish-situation-report";

export type IngestionSourceConfig = {
  name: IngestionSourceName;
  /** How often BullMQ re-runs this job — chosen per source's own crawl-delay/cache guidance. */
  everyMs: number;
  /**
   * La fuente externa que representa este trabajo, para dejar constancia de cada corrida en
   * `source_ingestion_runs`. Se omite en trabajos que no ingieren nada de afuera —publicar el
   * informe agrega datos que ya son nuestros— porque anotarlos como ingesta externa sería
   * inventar una fuente que no existe.
   */
  source?: IngestionSourceDefinition;
  /**
   * `runId` es la corrida que el orquestador ya abrió. Las fuentes oficiales lo necesitan para
   * colgar de ella sus versiones de registro en vez de abrir una segunda corrida en paralelo.
   */
  run: (context: { runId: string | null; previousEtag?: string | null }) => Promise<unknown>;
};

// `?? undefined`-style spreads on a value returned from a function call don't narrow under
// exactOptionalPropertyTypes — pull it into a local so TS can prove the branch.
function withDatabaseUrl<T extends Record<string, unknown>>(
  rest: T,
): T | (T & { databaseUrl: string }) {
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl ? { ...rest, databaseUrl } : rest;
}

const incidentCode = () => process.env.PULSO_INCIDENT_CODE ?? "colombia-2026";
const incidentStartedAt = () =>
  process.env.PULSO_INCIDENT_STARTED_AT ?? "2026-08-10T00:00:00-05:00";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const INGESTION_SOURCES: IngestionSourceConfig[] = [
  {
    // Real-time seismic feed — the most time-sensitive source.
    name: "sgc",
    everyMs: 5 * MINUTE,
    source: SGC_EARTHQUAKE_SOURCE,
    run: ({ runId }) =>
      runSgcEarthquakeIngestion(
        withDatabaseUrl({ since: incidentStartedAt(), ...(runId ? { runId } : {}) }),
      ),
  },
  {
    name: "cali",
    everyMs: 30 * MINUTE,
    source: CALI_OFFICIAL_SOURCE,
    run: ({ runId }) => runCaliOfficialIngestion(process.env.DATABASE_URL, runId ? { runId } : {}),
  },
  {
    // Administrative boundaries — effectively static.
    name: "dane",
    everyMs: 24 * HOUR,
    source: DANE_MGN_SOURCE,
    run: ({ runId }) =>
      runDaneTerritoryIngestion(
        withDatabaseUrl({ incidentCode: incidentCode(), ...(runId ? { runId } : {}) }),
      ),
  },
  {
    name: "contemos",
    everyMs: 10 * MINUTE,
    source: CONTEMOS_SOURCE,
    run: () => runContemosIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "gravitas",
    everyMs: 10 * MINUTE,
    source: GRAVITAS_SOURCE,
    run: () => runGravitasIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "ayudaspereira",
    everyMs: 15 * MINUTE,
    source: AYUDAS_PEREIRA_SOURCE,
    run: () => runAyudasPereiraIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    // Matches their own CDN cache window (max-age 4h) — polling faster would just re-fetch
    // the same cached snapshot.
    name: "terremotocolombia",
    everyMs: 4 * HOUR,
    source: TERREMOTOCOLOMBIA_SOURCE,
    run: () => runTerremotoColombiaIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "redcaliayuda",
    everyMs: 15 * MINUTE,
    source: REDCALIAYUDA_SOURCE,
    run: () => runRedCaliAyudaIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "redcaliayuda-acopio",
    everyMs: 15 * MINUTE,
    source: REDCALIAYUDA_ACOPIO_SOURCE,
    run: () => runRedCaliAyudaAcopioIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    // Contratación pública. Cadencia holgada: SECOP publica por lotes y el dato relevante aquí no
    // es el minuto de la firma sino el recorrido del recurso.
    name: "secop",
    everyMs: 6 * HOUR,
    source: SECOP_SOURCE,
    run: () =>
      runSecopIngestion(
        withDatabaseUrl({
          incidentCode: incidentCode(),
          cities: (process.env.PULSO_SECOP_CITIES ?? "Cali").split(",").map((city) => city.trim()),
          signedFrom: incidentStartedAt().slice(0, 10),
        }),
      ),
  },
  {
    // El ShakeMap se revisa durante los primeros días y luego se estabiliza; no hay nada que ganar
    // recalculando la malla contra 1.154 polígonos cada pocos minutos.
    name: "usgs",
    everyMs: 6 * HOUR,
    source: USGS_SHAKEMAP_SOURCE,
    run: () => runUsgsShakingIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    // 4 MB por descarga, con `cache-control: max-age=300` de su lado. Media hora es más lento que su
    // propia caché y, al pedir con `If-None-Match`, la mayoría de las corridas no descarga nada.
    name: "mapadelterremoto",
    everyMs: 30 * MINUTE,
    source: MAPADELTERREMOTO_SOURCE,
    run: ({ previousEtag }) =>
      runMapaDelTerremotoIngestion(
        withDatabaseUrl({ incidentCode: incidentCode(), previousEtag: previousEtag ?? null }),
      ),
  },
  {
    // Cada hora y con `If-None-Match`. Su fichero cambia una vez al día («próxima revisión» a las
    // 7:20), y la geocodificación de los puntos nuevos va a 4 peticiones por minuto: no conviene
    // que dos corridas se pisen.
    name: "cuidarcolombia",
    everyMs: 60 * MINUTE,
    source: CUIDARCOLOMBIA_SOURCE,
    run: ({ previousEtag }) =>
      runCuidarColombiaIngestion(
        withDatabaseUrl({ incidentCode: incidentCode(), previousEtag: previousEtag ?? null }),
      ),
  },
  {
    // Staggered after the community-report sources so each refresh picks up their latest counts.
    name: "publish-situation-report",
    everyMs: 20 * MINUTE,
    run: () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error("DATABASE_URL is required to publish the situation report");
      return runPublishSituationReport({ databaseUrl, incidentCode: incidentCode() });
    },
  },
];

/**
 * Ejecuta una fuente dejando constancia de la corrida —incluido el fallo— en
 * `source_ingestion_runs`.
 *
 * El fallo se anota aquí y no dentro de cada módulo porque casi siempre ocurre en la descarga,
 * que es lo primero que hace el módulo y sucede antes de que abra su propia conexión: un HTTP 403
 * no deja rastro si el único que puede escribirlo es quien ya se cayó. Este envoltorio abre su
 * conexión primero, así que puede anotar tanto lo que funcionó como lo que no.
 *
 * El error se vuelve a lanzar después de registrarlo: BullMQ tiene que seguir viendo el trabajo
 * como fallido para reintentarlo, y un registro que se traga la excepción convertiría una fuente
 * caída en una corrida aparentemente normal.
 */
export async function runIngestionSourceWithLog(source: IngestionSourceConfig): Promise<unknown> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!source.source || !databaseUrl) {
    return source.run({ runId: null });
  }

  const definition = source.source;
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    // El ETag de la corrida anterior viaja a la ingesta para que pueda pedir con `If-None-Match`.
    // Las fuentes que no lo usan lo ignoran.
    const previousEtag = await lastEtagForSource(sql, definition.id);
    const runId = await startIngestionRun(sql, definition);
    try {
      const result = await source.run({ runId, previousEtag });
      await completeIngestionRun(sql, runId, {
        status: outcomeFromResult(result),
        recordsSeen: recordsSeenFromResult(result),
        httpStatus: httpStatusFromResult(result),
        // Si la corrida no trajo ETag nuevo se conserva el anterior: perderlo obligaría a la
        // siguiente a descargarlo todo otra vez.
        etag: etagFromResult(result) ?? previousEtag,
      });
      return result;
    } catch (error) {
      await completeIngestionRun(sql, runId, {
        status: "failed",
        httpStatus: httpStatusFromError(error),
        errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
      });
      throw error;
    }
  } finally {
    await sql.end();
  }
}
