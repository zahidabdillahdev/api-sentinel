import fp from "fastify-plugin";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const COLLECTION_RUN_QUEUE = "collection-runs";
export type CollectionRunJob = {
  runId?: string;
  scheduleId?: string;
  maintenance?: "retention";
};

declare module "fastify" {
  interface FastifyInstance {
    runQueue: Queue<CollectionRunJob>;
  }
}

export default fp(async (app) => {
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
  const queue = new Queue<CollectionRunJob>(COLLECTION_RUN_QUEUE, {
    connection,
  });
  app.decorate("runQueue", queue);
  await queue.upsertJobScheduler(
    "daily-retention-cleanup",
    { pattern: "0 0 3 * * *", tz: "UTC" },
    {
      name: "retention-cleanup",
      data: { maintenance: "retention" },
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    },
  );
  app.addHook("onClose", async () => {
    await queue.close();
    await connection.quit();
  });
});
