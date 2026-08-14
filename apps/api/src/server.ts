import { buildApp } from "./app.js";

const port = Number.parseInt(process.env.API_PORT ?? "3001", 10);
const host = process.env.API_HOST ?? "0.0.0.0";
const app = await buildApp({ logger: true });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Stopping API");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host, port });
