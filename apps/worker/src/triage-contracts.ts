import path from "node:path";
import { config as loadEnv } from "dotenv";
import { runContractTriage } from "./contract-triage.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const result = await runContractTriage({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
  ...(process.env.PULSO_TRIAGE_LIMIT ? { limit: Number(process.env.PULSO_TRIAGE_LIMIT) } : {}),
});

console.info(JSON.stringify(result, null, 2));
