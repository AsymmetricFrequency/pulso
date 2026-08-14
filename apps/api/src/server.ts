import { buildApp } from "./app.js";
import { createPostgresRepositories } from "./postgres-repositories.js";

const port = Number.parseInt(process.env.API_PORT ?? "3001", 10);
const host = process.env.API_HOST ?? "0.0.0.0";
const persistenceDriver = process.env.PERSISTENCE_DRIVER ?? "memory";
const databaseUrl = process.env.DATABASE_URL;
if (persistenceDriver === "postgres" && !databaseUrl) {
  throw new Error("DATABASE_URL is required when PERSISTENCE_DRIVER=postgres");
}

const postgresRepositories =
  persistenceDriver === "postgres" && databaseUrl
    ? createPostgresRepositories(databaseUrl)
    : undefined;
const app = await buildApp({
  logger: true,
  persistence: postgresRepositories ? "postgres" : "memory",
  ...(postgresRepositories
    ? {
        incidentRepository: postgresRepositories.incidents,
        territoryRepository: postgresRepositories.territories,
      }
    : {}),
});

if (postgresRepositories) {
  app.addHook("onClose", async () => postgresRepositories.close());
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Stopping API");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host, port });
