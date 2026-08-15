import { runPublishSituationReport } from "./publish-situation-report.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to publish the situation report");

const result = await runPublishSituationReport({
  databaseUrl,
  incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
});
console.info(JSON.stringify(result, null, 2));
