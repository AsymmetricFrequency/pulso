import { Worker } from "bullmq";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.info("PULSO worker idle: REDIS_URL is not configured.");
  setInterval(() => undefined, 60_000);
} else {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker(
    "pulso-evidence",
    async (job) => {
      console.info("Evidence job received", { id: job.id, name: job.name });
      return { accepted: true, processedAt: new Date().toISOString() };
    },
    { connection },
  );

  const shutdown = async (signal: string) => {
    console.info("Stopping worker", { signal });
    await worker.close();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
