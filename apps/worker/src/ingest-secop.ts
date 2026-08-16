import path from "node:path";
import { config as loadEnv } from "dotenv";
import { runSecopIngestion } from "./secop.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const incidentCode = process.env.PULSO_INCIDENT_CODE ?? "colombia-2026";
const cities = (process.env.PULSO_SECOP_CITIES ?? "Cali").split(",").map((city) => city.trim());
const signedFrom = process.env.PULSO_INCIDENT_STARTED_AT?.slice(0, 10) ?? "2026-08-10";

const result = await runSecopIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  incidentCode,
  cities,
  signedFrom,
});

console.info(JSON.stringify(result, null, 2));
