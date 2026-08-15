import { runSeedCaliSuppliers } from "./seed-cali-suppliers.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed Cali suppliers");

const result = await runSeedCaliSuppliers(
  databaseUrl,
  process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
);
console.info(JSON.stringify(result, null, 2));
