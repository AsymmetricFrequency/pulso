import { runAyudasPereiraIngestion } from "./ayudaspereira.js";
import { runCaliOfficialIngestion } from "./cali-official.js";
import { runContemosIngestion } from "./contemos.js";
import { runDaneTerritoryIngestion } from "./dane-territories.js";
import { runGravitasIngestion } from "./gravitas.js";
import { runPublishSituationReport } from "./publish-situation-report.js";
import { runRedCaliAyudaIngestion } from "./redcaliayuda.js";
import { runRedCaliAyudaAcopioIngestion } from "./redcaliayuda-acopio.js";
import { runSgcEarthquakeIngestion } from "./sgc-earthquakes.js";
import { runTerremotoColombiaIngestion } from "./terremotocolombia.js";

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
  | "publish-situation-report";

export type IngestionSourceConfig = {
  name: IngestionSourceName;
  /** How often BullMQ re-runs this job — chosen per source's own crawl-delay/cache guidance. */
  everyMs: number;
  run: () => Promise<unknown>;
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
    run: () => runSgcEarthquakeIngestion(withDatabaseUrl({ since: incidentStartedAt() })),
  },
  {
    name: "cali",
    everyMs: 30 * MINUTE,
    run: () => runCaliOfficialIngestion(process.env.DATABASE_URL),
  },
  {
    // Administrative boundaries — effectively static.
    name: "dane",
    everyMs: 24 * HOUR,
    run: () => runDaneTerritoryIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "contemos",
    everyMs: 10 * MINUTE,
    run: () => runContemosIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "gravitas",
    everyMs: 10 * MINUTE,
    run: () => runGravitasIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "ayudaspereira",
    everyMs: 15 * MINUTE,
    run: () => runAyudasPereiraIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    // Matches their own CDN cache window (max-age 4h) — polling faster would just re-fetch
    // the same cached snapshot.
    name: "terremotocolombia",
    everyMs: 4 * HOUR,
    run: () => runTerremotoColombiaIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "redcaliayuda",
    everyMs: 15 * MINUTE,
    run: () => runRedCaliAyudaIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
  },
  {
    name: "redcaliayuda-acopio",
    everyMs: 15 * MINUTE,
    run: () => runRedCaliAyudaAcopioIngestion(withDatabaseUrl({ incidentCode: incidentCode() })),
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
