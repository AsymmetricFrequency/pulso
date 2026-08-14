import { runCaliOfficialIngestion } from "./cali-official.js";

const result = await runCaliOfficialIngestion(process.env.DATABASE_URL);
console.info(JSON.stringify(result, null, 2));
