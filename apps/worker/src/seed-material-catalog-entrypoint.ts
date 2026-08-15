import { runSeedMaterialCatalog } from "./seed-material-catalog.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the material catalog");

const result = await runSeedMaterialCatalog(databaseUrl);
console.info(JSON.stringify(result, null, 2));
