import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  authenticatedUserId,
  requireProjectRole,
} from "../lib/authorization.js";
import { notFound } from "../lib/errors.js";
import { assertSafeTarget } from "../lib/safe-url.js";
import { redactSecrets, resolveVariables } from "../lib/variables.js";
import { decrypt } from "../lib/encryption.js";

const projectParams = z.object({ projectId: z.string().cuid() });
const collectionParams = z.object({ collectionId: z.string().cuid() });
const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const collectionBody = z.object({
  name: z.string().min(2).max(100),
  environmentId: z.string().cuid().optional(),
});
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
      const { limit } = historyQuery.parse(request.query);
      await collectionForUser(app, authenticatedUserId(request), collectionId);
      return app.prisma.executionRun.findMany({
        where: { collectionId },
        take: limit,
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
      const collection = await app.prisma.collection.findUnique({
        where: { id: collectionId },
        include: {
          environment: { include: { secrets: true } },
          requests: { include: { assertions: true } },
        },
      });
      if (!collection) throw notFound("Collection");
      const results = await Promise.all(
        collection.requests.map(async (testRequest) => {
          const started = Date.now();
          let secretValues: string[] = [];
          try {
            const secrets = Object.fromEntries(
              (collection.environment?.secrets ?? []).map((secret) => [
                secret.name,
                decrypt(secret),
              ]),
            );
            secretValues = Object.values(secrets);
            const variables = {
              baseUrl: collection.environment?.baseUrl.replace(/\/$/, "") ?? "",
              ...secrets,
            };
            const url = resolveVariables(testRequest.url, variables);
            if (!url.startsWith("http"))
              throw new Error(
                "Request requires an environment with a base URL",
              );
            await assertSafeTarget(url);
            const headers = Object.fromEntries(
              Object.entries(
                (testRequest.headers as Record<string, string>) ?? {},
              ).map(([key, value]) => [
                key,
                resolveVariables(value, variables),
              ]),
            );
            const response = await fetch(url, {
              method: testRequest.method,
              headers,
              body: testRequest.body
                ? resolveVariables(testRequest.body, variables)
                : undefined,
              redirect: "error",
              signal: AbortSignal.timeout(10_000),
            });
            const durationMs = Date.now() - started;
            const failures: string[] = [];
            if (
              !testRequest.assertions.every(
                (assertion) => assertion.expectedStatus === response.status,
              )
            )
              failures.push(
                `Expected status ${testRequest.assertions.map((a) => a.expectedStatus).join(", ")}, received ${response.status}`,
              );
            if (
              testRequest.expectedHeaderName &&
              response.headers.get(testRequest.expectedHeaderName) !==
                testRequest.expectedHeaderValue
            )
              failures.push(
                `Header ${testRequest.expectedHeaderName} did not match`,
              );
            if (
              testRequest.maxDurationMs &&
              durationMs > testRequest.maxDurationMs
            )
              failures.push(
                `Expected response under ${testRequest.maxDurationMs}ms, received ${durationMs}ms`,
              );
            if (testRequest.jsonPath) {
              const payload = (await response.json().catch(() => undefined)) as
                | Record<string, unknown>
                | undefined;
              const actual = testRequest.jsonPath
                .slice(2)
                .split(".")
                .reduce<unknown>(
                  (value, key) =>
                    value && typeof value === "object"
                      ? (value as Record<string, unknown>)[key]
                      : undefined,
                  payload,
                );
              if (JSON.stringify(actual) !== testRequest.expectedJsonValue)
                failures.push(
                  `JSON path ${testRequest.jsonPath} did not match`,
                );
            }
            return {
              testRequestId: testRequest.id,
              statusCode: response.status,
              durationMs,
              passed: failures.length === 0,
              error: failures.join("; ") || undefined,
            };
          } catch (error) {
            return {
              testRequestId: testRequest.id,
              durationMs: Date.now() - started,
              passed: false,
              error: redactSecrets(
                error instanceof Error ? error.message : "Request failed",
                secretValues,
              ),
            };
          }
        }),
      );
      const status = results.every((result) => result.passed)
        ? "PASSED"
        : "FAILED";
      return reply.code(201).send(
        await app.prisma.executionRun.create({
          data: { collectionId, status, results: { create: results } },
          include: {
            results: {
              include: {
                testRequest: {
                  select: { name: true, method: true, url: true },
                },
              },
            },
          },
        }),
      );
    },
  );
};
