import { runRemoteDamageIngestion } from "./remote-damage.js";

const result = await runRemoteDamageIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  ...(process.env.PULSO_INCIDENT_CODE ? { incidentCode: process.env.PULSO_INCIDENT_CODE } : {}),
});
console.info(JSON.stringify(result, null, 2));
