import path from "node:path";
import { Queue, Worker } from "bullmq";
import { config as loadEnv } from "dotenv";
import { Redis } from "ioredis";
import { INGESTION_SOURCES } from "./scheduler.js";

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
        const result = await source.run();
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
