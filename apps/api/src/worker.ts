import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { executeCollectionRun } from "./lib/collection-runner.js";
import { COLLECTION_RUN_QUEUE } from "./plugins/queue.js";
import type { CollectionRunJob } from "./plugins/queue.js";

const prisma = new PrismaClient();
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const worker = new Worker<CollectionRunJob>(
  COLLECTION_RUN_QUEUE,
  async (job) => {
    let runId = job.data.runId;
    if (!runId && job.data.scheduleId) {
      const schedule = await prisma.schedule.findUnique({
        where: { id: job.data.scheduleId },
      });
      if (!schedule?.enabled) return;
      try {
        const run = await prisma.executionRun.create({
          data: {
            collectionId: schedule.collectionId,
            scheduleId: schedule.id,
            status: "QUEUED",
          },
        });
        runId = run.id;
        await job.updateData({ ...job.data, runId });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return;
        throw error;
      }
    }
    if (!runId)
      throw new Error("Queue job does not reference a run or schedule");
    await executeCollectionRun(prisma, runId);
  },
  { connection, concurrency: 5 },
);

worker.on("completed", (job) =>
  console.info(
    { runId: job.data.runId, scheduleId: job.data.scheduleId },
    "collection run completed",
  ),
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
