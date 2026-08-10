import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { executeCollectionRun } from "./lib/collection-runner.js";
import { deliverFailureNotifications } from "./lib/webhook-notifications.js";
import { cleanupExpiredRuns } from "./lib/retention.js";
import { COLLECTION_RUN_QUEUE } from "./plugins/queue.js";
import type { CollectionRunJob } from "./plugins/queue.js";
import {
  ActiveRunQuotaExceededError,
  createQueuedRunWithinQuota,
} from "./lib/run-quota.js";

const prisma = new PrismaClient();
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const worker = new Worker<CollectionRunJob>(
  COLLECTION_RUN_QUEUE,
  async (job) => {
    if (job.data.maintenance === "retention") {
      const result = await cleanupExpiredRuns(prisma);
      console.info(result, "retention cleanup completed");
      return;
    }
    let runId = job.data.runId;
    if (!runId && job.data.scheduleId) {
      const schedule = await prisma.schedule.findUnique({
        where: { id: job.data.scheduleId },
      });
      if (!schedule?.enabled) return;
      try {
        const run = await createQueuedRunWithinQuota(prisma, {
          collectionId: schedule.collectionId,
          scheduleId: schedule.id,
          maxActiveRuns: config.MAX_ACTIVE_RUNS_PER_ORGANIZATION,
        });
        runId = run.id;
        await job.updateData({ ...job.data, runId });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return;
        if (error instanceof ActiveRunQuotaExceededError) {
          const rejectedRun = await prisma.executionRun.create({
            data: {
              collectionId: schedule.collectionId,
              scheduleId: schedule.id,
              status: "FAILED",
              finishedAt: new Date(),
              error: "Organization active run quota exceeded",
            },
          });
          await deliverFailureNotifications(prisma, rejectedRun.id);
          return;
        }
        throw error;
      }
    }
    if (!runId)
      throw new Error("Queue job does not reference a run or schedule");
    try {
      await executeCollectionRun(prisma, runId);
    } catch (error) {
      const finalAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (finalAttempt) await deliverFailureNotifications(prisma, runId);
      throw error;
    }
    await deliverFailureNotifications(prisma, runId);
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
