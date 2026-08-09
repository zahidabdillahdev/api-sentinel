import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  authenticatedUserId,
  requireProjectRole,
} from "../lib/authorization.js";
import { AppError, notFound } from "../lib/errors.js";
import { encrypt } from "../lib/encryption.js";
import { assertSafeTarget } from "../lib/safe-url.js";

const projectParams = z.object({ projectId: z.string().cuid() });
const collectionParams = z.object({ collectionId: z.string().cuid() });
const runParams = z.object({ runId: z.string().cuid() });
const scheduleParams = z.object({ scheduleId: z.string().cuid() });
const notificationRuleParams = z.object({
  notificationRuleId: z.string().cuid(),
});
const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().cuid().optional(),
});
const collectionBody = z.object({
  name: z.string().min(2).max(100),
  environmentId: z.string().cuid().optional(),
});
const scheduleBody = z.object({
  name: z.string().min(2).max(100),
  cron: z.string().min(5).max(100),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .default("UTC")
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone"),
});
const scheduleStateBody = z.object({ enabled: z.boolean() });
const notificationRuleBody = z.object({
  name: z.string().min(2).max(100),
  endpoint: z.string().url().max(2048),
  signingSecret: z.string().min(16).max(500).optional(),
});
const notificationRuleStateBody = z.object({ enabled: z.boolean() });
const requestBody = z
  .object({
    name: z.string().min(2).max(100),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    url: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => {
        try {
          const candidate = value.replace(
            /\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/g,
            "placeholder",
          );
          new URL(
            candidate.startsWith("placeholder/")
              ? `https://${candidate}`
              : candidate,
          );
          return true;
        } catch {
          return false;
        }
      }, "Invalid URL template"),
    expectedStatus: z.number().int().min(100).max(599),
    headers: z
      .record(z.string().min(1).max(100), z.string().max(2000))
      .optional(),
    body: z.string().max(100_000).optional(),
    expectedHeaderName: z.string().min(1).max(100).optional(),
    expectedHeaderValue: z.string().max(500).optional(),
    jsonPath: z
      .string()
      .regex(/^\$\.[A-Za-z0-9_.-]+$/)
      .optional(),
    expectedJsonValue: z.string().max(2000).optional(),
    maxDurationMs: z.number().int().positive().max(10_000).optional(),
  })
  .superRefine((body, context) => {
    if (Boolean(body.expectedHeaderName) !== Boolean(body.expectedHeaderValue))
      context.addIssue({
        code: "custom",
        message: "Header name and value must be provided together",
      });
    if (Boolean(body.jsonPath) !== Boolean(body.expectedJsonValue))
      context.addIssue({
        code: "custom",
        message: "JSON path and expected value must be provided together",
      });
    if (body.expectedJsonValue) {
      try {
        JSON.parse(body.expectedJsonValue);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["expectedJsonValue"],
          message: "Expected JSON value must be valid JSON",
        });
      }
    }
  });

async function collectionForUser(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  collectionId: string,
  role: "VIEWER" | "MEMBER" = "VIEWER",
) {
  const collection = await app.prisma.collection.findUnique({
    where: { id: collectionId },
    include: { project: { select: { id: true } } },
  });
  if (!collection) throw notFound("Collection");
  await requireProjectRole(app, userId, collection.project.id, role);
  return collection;
}

async function runForUser(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  runId: string,
) {
  const run = await app.prisma.executionRun.findUnique({
    where: { id: runId },
    include: { collection: { select: { projectId: true } } },
  });
  if (!run) throw notFound("Execution run");
  await requireProjectRole(app, userId, run.collection.projectId);
  return run;
}

async function scheduleForUser(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  scheduleId: string,
  role: "VIEWER" | "MEMBER" = "VIEWER",
) {
  const schedule = await app.prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { collection: { select: { projectId: true } } },
  });
  if (!schedule) throw notFound("Schedule");
  await requireProjectRole(app, userId, schedule.collection.projectId, role);
  return schedule;
}

async function notificationRuleForUser(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  notificationRuleId: string,
  role: "VIEWER" | "MEMBER" = "VIEWER",
) {
  const rule = await app.prisma.notificationRule.findUnique({
    where: { id: notificationRuleId },
    include: { collection: { select: { projectId: true } } },
  });
  if (!rule) throw notFound("Notification rule");
  await requireProjectRole(app, userId, rule.collection.projectId, role);
  return rule;
}

export const collectionRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/projects/:projectId/collections",
    { preHandler: app.authenticate },
    async (request) => {
      const { projectId } = projectParams.parse(request.params);
      await requireProjectRole(app, authenticatedUserId(request), projectId);
      return app.prisma.collection.findMany({
        where: { projectId },
        include: { requests: { include: { assertions: true } } },
        orderBy: { createdAt: "desc" },
      });
    },
  );
  app.post(
    "/projects/:projectId/collections",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { projectId } = projectParams.parse(request.params);
      await requireProjectRole(
        app,
        authenticatedUserId(request),
        projectId,
        "MEMBER",
      );
      const body = collectionBody.parse(request.body);
      if (
        body.environmentId &&
        !(await app.prisma.environment.findFirst({
          where: { id: body.environmentId, projectId },
        }))
      )
        throw notFound("Environment");
      return reply
        .code(201)
        .send(
          await app.prisma.collection.create({ data: { projectId, ...body } }),
        );
    },
  );
  app.post(
    "/collections/:collectionId/requests",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { collectionId } = collectionParams.parse(request.params);
      await collectionForUser(
        app,
        authenticatedUserId(request),
        collectionId,
        "MEMBER",
      );
      const body = requestBody.parse(request.body);
      if (!body.url.includes("{{")) await assertSafeTarget(body.url);
      const { expectedStatus, ...requestData } = body;
      return reply.code(201).send(
        await app.prisma.testRequest.create({
          data: {
            ...requestData,
            collectionId,
            assertions: { create: { expectedStatus } },
          },
          include: { assertions: true },
        }),
      );
    },
  );
  app.get(
    "/collections/:collectionId/runs",
    { preHandler: app.authenticate },
    async (request) => {
      const { collectionId } = collectionParams.parse(request.params);
      const { limit, cursor } = historyQuery.parse(request.query);
      await collectionForUser(app, authenticatedUserId(request), collectionId);
      if (
        cursor &&
        !(await app.prisma.executionRun.findFirst({
          where: { id: cursor, collectionId },
          select: { id: true },
        }))
      )
        throw new AppError("Invalid run cursor", 400, "INVALID_RUN_CURSOR");
      return app.prisma.executionRun.findMany({
        where: { collectionId },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          results: {
            include: {
              testRequest: { select: { name: true, method: true, url: true } },
            },
          },
        },
      });
    },
  );
  app.post(
    "/collections/:collectionId/runs",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { collectionId } = collectionParams.parse(request.params);
      await collectionForUser(
        app,
        authenticatedUserId(request),
        collectionId,
        "MEMBER",
      );
      if (
        (await app.prisma.testRequest.count({ where: { collectionId } })) === 0
      )
        throw new AppError(
          "Collection has no requests",
          422,
          "EMPTY_COLLECTION",
        );
      const run = await app.prisma.executionRun.create({
        data: { collectionId, status: "QUEUED" },
      });
      try {
        await app.runQueue.add(
          "execute",
          { runId: run.id },
          {
            jobId: run.id,
            attempts: 3,
            backoff: { type: "exponential", delay: 1_000 },
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
          },
        );
      } catch {
        await app.prisma.executionRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error: "Unable to enqueue execution",
          },
        });
        throw new AppError(
          "Unable to enqueue collection run",
          503,
          "QUEUE_UNAVAILABLE",
        );
      }
      return reply.code(202).send({ ...run, results: [] });
    },
  );

  app.get("/runs/:runId", { preHandler: app.authenticate }, async (request) => {
    const { runId } = runParams.parse(request.params);
    await runForUser(app, authenticatedUserId(request), runId);
    return app.prisma.executionRun.findUnique({
      where: { id: runId },
      include: {
        results: {
          include: {
            testRequest: { select: { name: true, method: true, url: true } },
          },
        },
      },
    });
  });

  app.get(
    "/collections/:collectionId/schedules",
    { preHandler: app.authenticate },
    async (request) => {
      const { collectionId } = collectionParams.parse(request.params);
      await collectionForUser(app, authenticatedUserId(request), collectionId);
      return app.prisma.schedule.findMany({
        where: { collectionId },
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.post(
    "/collections/:collectionId/schedules",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { collectionId } = collectionParams.parse(request.params);
      await collectionForUser(
        app,
        authenticatedUserId(request),
        collectionId,
        "MEMBER",
      );
      const body = scheduleBody.parse(request.body);
      let schedule;
      try {
        schedule = await app.prisma.schedule.create({
          data: { collectionId, ...body },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002")
          throw new AppError(
            "A schedule with this name already exists",
            409,
            "SCHEDULE_NAME_TAKEN",
          );
        throw error;
      }
      try {
        await app.runQueue.upsertJobScheduler(
          schedule.id,
          { pattern: schedule.cron, tz: schedule.timezone },
          {
            name: "scheduled-execution",
            data: { scheduleId: schedule.id },
            opts: {
              attempts: 3,
              backoff: { type: "exponential", delay: 1_000 },
              removeOnComplete: 1_000,
              removeOnFail: 1_000,
            },
          },
        );
      } catch (error) {
        await app.prisma.schedule.delete({ where: { id: schedule.id } });
        throw new AppError(
          error instanceof Error ? error.message : "Invalid schedule",
          422,
          "INVALID_SCHEDULE",
        );
      }
      return reply.code(201).send(schedule);
    },
  );

  app.patch(
    "/schedules/:scheduleId",
    { preHandler: app.authenticate },
    async (request) => {
      const { scheduleId } = scheduleParams.parse(request.params);
      const { enabled } = scheduleStateBody.parse(request.body);
      const schedule = await scheduleForUser(
        app,
        authenticatedUserId(request),
        scheduleId,
        "MEMBER",
      );
      if (enabled) {
        await app.prisma.schedule.update({
          where: { id: scheduleId },
          data: { enabled: true },
        });
        try {
          await app.runQueue.upsertJobScheduler(
            schedule.id,
            { pattern: schedule.cron, tz: schedule.timezone },
            {
              name: "scheduled-execution",
              data: { scheduleId },
              opts: {
                attempts: 3,
                backoff: { type: "exponential", delay: 1_000 },
                removeOnComplete: 1_000,
                removeOnFail: 1_000,
              },
            },
          );
        } catch (error) {
          await app.prisma.schedule.update({
            where: { id: scheduleId },
            data: { enabled: false },
          });
          throw new AppError(
            error instanceof Error
              ? error.message
              : "Unable to enable schedule",
            422,
            "INVALID_SCHEDULE",
          );
        }
      } else {
        await app.runQueue.removeJobScheduler(scheduleId);
        await app.prisma.schedule.update({
          where: { id: scheduleId },
          data: { enabled: false },
        });
      }
      return app.prisma.schedule.findUnique({ where: { id: scheduleId } });
    },
  );

  app.delete(
    "/schedules/:scheduleId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { scheduleId } = scheduleParams.parse(request.params);
      await scheduleForUser(
        app,
        authenticatedUserId(request),
        scheduleId,
        "MEMBER",
      );
      await app.runQueue.removeJobScheduler(scheduleId);
      await app.prisma.schedule.delete({ where: { id: scheduleId } });
      return reply.code(204).send();
    },
  );

  app.get(
    "/collections/:collectionId/notification-rules",
    { preHandler: app.authenticate },
    async (request) => {
      const { collectionId } = collectionParams.parse(request.params);
      await collectionForUser(app, authenticatedUserId(request), collectionId);
      return app.prisma.notificationRule.findMany({
        where: { collectionId },
        select: {
          id: true,
          name: true,
          endpointOrigin: true,
          enabled: true,
          createdAt: true,
          updatedAt: true,
          deliveries: {
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              executionRunId: true,
              attempt: true,
              status: true,
              responseStatus: true,
              durationMs: true,
              error: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.post(
    "/collections/:collectionId/notification-rules",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { collectionId } = collectionParams.parse(request.params);
      await collectionForUser(
        app,
        authenticatedUserId(request),
        collectionId,
        "MEMBER",
      );
      const body = notificationRuleBody.parse(request.body);
      const endpoint = await assertSafeTarget(body.endpoint);
      const encryptedEndpoint = encrypt(body.endpoint);
      const encryptedSecret = body.signingSecret
        ? encrypt(body.signingSecret)
        : undefined;
      try {
        return reply.code(201).send(
          await app.prisma.notificationRule.create({
            data: {
              collectionId,
              name: body.name,
              endpointOrigin: endpoint.origin,
              endpointCiphertext: encryptedEndpoint.ciphertext,
              endpointIv: encryptedEndpoint.iv,
              endpointAuthTag: encryptedEndpoint.authTag,
              signingSecretCiphertext: encryptedSecret?.ciphertext,
              signingSecretIv: encryptedSecret?.iv,
              signingSecretAuthTag: encryptedSecret?.authTag,
            },
            select: {
              id: true,
              name: true,
              endpointOrigin: true,
              enabled: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
        );
      } catch (error) {
        if ((error as { code?: string }).code === "P2002")
          throw new AppError(
            "A notification rule with this name already exists",
            409,
            "NOTIFICATION_RULE_NAME_TAKEN",
          );
        throw error;
      }
    },
  );

  app.patch(
    "/notification-rules/:notificationRuleId",
    { preHandler: app.authenticate },
    async (request) => {
      const { notificationRuleId } = notificationRuleParams.parse(
        request.params,
      );
      const { enabled } = notificationRuleStateBody.parse(request.body);
      await notificationRuleForUser(
        app,
        authenticatedUserId(request),
        notificationRuleId,
        "MEMBER",
      );
      return app.prisma.notificationRule.update({
        where: { id: notificationRuleId },
        data: { enabled },
        select: {
          id: true,
          name: true,
          endpointOrigin: true,
          enabled: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    },
  );
};
