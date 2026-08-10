import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import queuePlugin from "./plugins/queue.js";
import { authRoutes } from "./routes/auth.js";
import { memberRoutes } from "./routes/members.js";
import { collectionRoutes } from "./routes/collections.js";
import { healthRoutes } from "./routes/health.js";
import { overviewRoutes } from "./routes/overview.js";
import { governanceRoutes } from "./routes/governance.js";
import { projectRoutes } from "./routes/projects.js";
import { specificationRoutes } from "./routes/specifications.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    requestIdHeader: "x-request-id",
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            details: error.flatten(),
          },
        });
    if (error instanceof AppError)
      return reply
        .code(error.statusCode)
        .send({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
    if ((error as { statusCode?: number }).statusCode === 429)
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests; retry later",
        },
      });
    return reply
      .code(500)
      .send({
        error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
      });
  });
  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
  const rateLimitRedis = new Redis(config.REDIS_URL, {
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    redis: rateLimitRedis,
    skipOnError: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests; retry later",
        details: { retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1_000)) },
      },
    }),
  });
  app.addHook("onClose", async () => {
    await rateLimitRedis.quit();
  });
  await app.register(swagger, {
    openapi: { info: { title: "API Sentinel API", version: "0.1.0" } },
  });
  await app.register(swaggerUi, { routePrefix: "/documentation" });
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(queuePlugin);
  await app.register(healthRoutes, { prefix: "/v1" });
  await app.register(overviewRoutes, { prefix: "/v1" });
  await app.register(governanceRoutes, { prefix: "/v1" });
  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(memberRoutes, { prefix: "/v1" });
  await app.register(collectionRoutes, { prefix: "/v1" });
  await app.register(projectRoutes, { prefix: "/v1" });
  await app.register(specificationRoutes, { prefix: "/v1" });
  return app;
}
