import { runSgcEarthquakeIngestion } from "./sgc-earthquakes.js";

const result = await runSgcEarthquakeIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  since: process.env.PULSO_INCIDENT_STARTED_AT ?? "2026-08-10T00:00:00-05:00",
});
console.info(JSON.stringify({ ...result, events: result.events?.slice(0, 5) }, null, 2));
