import path from "node:path";
import { config as loadEnv } from "dotenv";
import { runUsgsShakingIngestion } from "./usgs.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const result = await runUsgsShakingIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
  ...(process.env.PULSO_USGS_EVENT_ID ? { eventId: process.env.PULSO_USGS_EVENT_ID } : {}),
});

console.info(JSON.stringify(result, null, 2));
