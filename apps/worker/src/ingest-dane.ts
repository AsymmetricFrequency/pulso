import { runDaneTerritoryIngestion } from "./dane-territories.js";

const result = await runDaneTerritoryIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  ...(process.env.PULSO_INCIDENT_CODE ? { incidentCode: process.env.PULSO_INCIDENT_CODE } : {}),
});
console.info(JSON.stringify(result, null, 2));
