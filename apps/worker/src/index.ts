import path from "node:path";
import { Queue, Worker } from "bullmq";
import { config as loadEnv } from "dotenv";
import { Redis } from "ioredis";
import postgres from "postgres";
import { closeAbandonedRuns } from "./ingestion-run-log.js";
import { INGESTION_SOURCES, runIngestionSourceWithLog } from "./scheduler.js";

// `pnpm --filter @pulso/worker dev` runs with this package's directory as cwd, not the repo
// root, so the shared .env at the repo root has to be loaded explicitly.
loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.info("PULSO worker idle: REDIS_URL is not configured.");
  setInterval(() => undefined, 60_000);
} else {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const evidenceWorker = new Worker(
    "pulso-evidence",
    async (job) => {
      console.info("Evidence job received", { id: job.id, name: job.name });
      return { accepted: true, processedAt: new Date().toISOString() };
    },
    { connection },
  );

  const ingestionEnabled = process.env.SOURCE_INGESTION_ENABLED === "true";
  let ingestionQueue: Queue | undefined;
  let ingestionWorker: Worker | undefined;

  if (ingestionEnabled) {
    ingestionQueue = new Queue("pulso-ingestion", { connection });
    ingestionWorker = new Worker(
      "pulso-ingestion",
      async (job) => {
        const source = INGESTION_SOURCES.find((item) => item.name === job.name);
        if (!source) throw new Error(`Unknown ingestion source: ${job.name}`);
        console.info("Ingestion job started", { source: source.name });
        // Con registro: la corrida queda anotada en `source_ingestion_runs` pase lo que pase, así
        // que una fuente caída se puede ver consultando la base y no solo leyendo este log.
        const result = await runIngestionSourceWithLog(source);
        console.info("Ingestion job finished", { source: source.name, result });
        return result;
      },
      { connection },
    );
    ingestionWorker.on("failed", (job, error) => {
      console.error("Ingestion job failed", { source: job?.name, error: error.message });
    });

    for (const source of INGESTION_SOURCES) {
      // Idempotent: safe to call every worker startup, won't create duplicate schedules.
      await ingestionQueue.upsertJobScheduler(
        source.name,
        { every: source.everyMs },
        { name: source.name },
      );
    }
    // Un despliegue o un reinicio deja corridas a medias marcadas como 'running'. Cerrarlas al
    // arrancar evita confundirlas con una ingesta que de verdad se quedó colgada.
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      const sql = postgres(databaseUrl, { max: 1 });
      try {
        const closed = await closeAbandonedRuns(sql);
        if (closed > 0) console.info("Closed abandoned ingestion runs", { closed });
      } catch (error) {
        console.error("Could not close abandoned ingestion runs", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await sql.end();
      }
    }

    console.info("Automated ingestion scheduling enabled", {
      sources: INGESTION_SOURCES.map((source) => source.name),
    });
  } else {
    console.info(
      "Automated ingestion is off (SOURCE_INGESTION_ENABLED != 'true'). " +
        "Run `pnpm ingest:<source>` manually, or set the flag to schedule it.",
    );
  }

  const shutdown = async (signal: string) => {
    console.info("Stopping worker", { signal });
    await evidenceWorker.close();
    await ingestionWorker?.close();
    await ingestionQueue?.close();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
