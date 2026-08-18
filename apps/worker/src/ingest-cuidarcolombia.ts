import { runCuidarColombiaIngestion } from "./cuidarcolombia.js";

const result = await runCuidarColombiaIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
  previousEtag: process.env.PULSO_REGISTRY_ETAG ?? null,
});
console.info(JSON.stringify(result, null, 2));
