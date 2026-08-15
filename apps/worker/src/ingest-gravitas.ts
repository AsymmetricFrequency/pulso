import { runGravitasIngestion } from "./gravitas.js";

const result = await runGravitasIngestion({
  ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
  incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
});
console.info(
  JSON.stringify(
    { ...result, points: "points" in result ? result.points.slice(0, 5) : undefined },
    null,
    2,
  ),
);
