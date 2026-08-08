import fp from "fastify-plugin";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const COLLECTION_RUN_QUEUE = "collection-runs";

declare module "fastify" {
  interface FastifyInstance {
    runQueue: Queue<{ runId: string }>;
  }
}

export default fp(async (app) => {
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
  const queue = new Queue<{ runId: string }>(COLLECTION_RUN_QUEUE, {
    connection,
  });
  app.decorate("runQueue", queue);
  app.addHook("onClose", async () => {
    await queue.close();
    await connection.quit();
  });
});
