import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { executeCollectionRun } from "./lib/collection-runner.js";
import { COLLECTION_RUN_QUEUE } from "./plugins/queue.js";

const prisma = new PrismaClient();
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const worker = new Worker<{ runId: string }>(
  COLLECTION_RUN_QUEUE,
  async (job) => executeCollectionRun(prisma, job.data.runId),
  { connection, concurrency: 5 },
);

worker.on("completed", (job) =>
  console.info({ runId: job.data.runId }, "collection run completed"),
);
worker.on("failed", (job, error) =>
  console.error(
    { runId: job?.data.runId, error: error.message },
    "collection run failed",
  ),
);

async function shutdown() {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
