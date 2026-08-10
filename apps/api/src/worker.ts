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
import {
  recoverStaleRuns,
  touchRunHeartbeat,
} from "./lib/run-recovery.js";

const prisma = new PrismaClient();
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const HEARTBEAT_INTERVAL_MS = 10_000;
const NOTIFICATION_RECOVERY_CONCURRENCY = 5;
const worker = new Worker<CollectionRunJob>(
  COLLECTION_RUN_QUEUE,
  async (job) => {
    if (job.data.maintenance === "retention") {
      const result = await cleanupExpiredRuns(prisma);
      console.info(result, "retention cleanup completed");
      return;
    }
    if (job.data.maintenance === "stale-runs") {
      const result = await recoverStaleRuns(
        prisma,
        config.RUN_STALE_AFTER_SECONDS,
      );
      for (
        let index = 0;
        index < result.recoveredRunIds.length;
        index += NOTIFICATION_RECOVERY_CONCURRENCY
      )
        await Promise.all(
          result.recoveredRunIds
            .slice(index, index + NOTIFICATION_RECOVERY_CONCURRENCY)
            .map((runId) => deliverFailureNotifications(prisma, runId)),
        );
      console.info(result, "stale run recovery completed");
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
    const heartbeatTimer = setInterval(() => {
      void touchRunHeartbeat(prisma, runId).catch((error) =>
        console.error(
          { runId, error: error instanceof Error ? error.message : error },
          "run heartbeat update failed",
        ),
      );
    }, HEARTBEAT_INTERVAL_MS);
    try {
      await executeCollectionRun(prisma, runId);
    } catch (error) {
      const finalAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (finalAttempt) {
        await prisma.executionRun.updateMany({
          where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            heartbeatAt: new Date(),
            error: "Execution failed after worker retries",
          },
        });
        await deliverFailureNotifications(prisma, runId);
      }
      throw error;
    } finally {
      clearInterval(heartbeatTimer);
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
