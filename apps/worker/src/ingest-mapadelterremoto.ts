import { runMapaDelTerremotoIngestion } from "./mapadelterremoto.js";

const result = await runMapaDelTerremotoIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
  // Ejecutado a mano no hay ETag anterior que consultar, así que siempre descarga. El programador
  // sí lo pasa: ver `scheduler.ts`.
  previousEtag: process.env.PULSO_REGISTRY_ETAG ?? null,
});
console.info(
  JSON.stringify({ ...result, points: "points" in result ? result.points : undefined }, null, 2),
);
