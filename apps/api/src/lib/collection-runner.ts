import type { PrismaClient } from "@prisma/client";
import { decrypt } from "./encryption.js";
import { assertSafeTarget } from "./safe-url.js";
import { redactSecrets, resolveVariables } from "./variables.js";
import { config } from "../config.js";
import {
  discardResponseBody,
  readResponseBody,
} from "./response-body.js";

export async function executeCollectionRun(
  prisma: PrismaClient,
  runId: string,
) {
  const run = await prisma.executionRun.findUnique({
    where: { id: runId },
    include: {
      collection: {
        include: {
          environment: { include: { secrets: true } },
          requests: { include: { assertions: true } },
        },
      },
    },
  });
  if (!run) throw new Error(`Execution run ${runId} was not found`);
  if (run.status === "PASSED" || run.status === "FAILED") return false;

  const startedAt = new Date();
  const claimed = await prisma.executionRun.updateMany({
    where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
    data: {
      status: "RUNNING",
      startedAt: run.startedAt ?? startedAt,
      heartbeatAt: startedAt,
      finishedAt: null,
      error: null,
    },
  });
  if (claimed.count !== 1) return false;

  try {
    const results = await Promise.all(
      run.collection.requests.map(async (testRequest) => {
        const started = Date.now();
        let secretValues: string[] = [];
        let responseStatus: number | undefined;
        try {
          const secrets = Object.fromEntries(
            (run.collection.environment?.secrets ?? []).map((secret) => [
              secret.name,
              decrypt(secret),
            ]),
          );
          secretValues = Object.values(secrets);
          const variables = {
            baseUrl:
              run.collection.environment?.baseUrl.replace(/\/$/, "") ?? "",
            ...secrets,
          };
          const url = resolveVariables(testRequest.url, variables);
          if (!url.startsWith("http"))
            throw new Error("Request requires an environment with a base URL");
          await assertSafeTarget(url);
          const headers = Object.fromEntries(
            Object.entries(
              (testRequest.headers as Record<string, string>) ?? {},
            ).map(([key, value]) => [key, resolveVariables(value, variables)]),
          );
          const response = await fetch(url, {
            method: testRequest.method,
            headers,
            body:
              testRequest.method === "GET"
                ? undefined
                : testRequest.body
                  ? resolveVariables(testRequest.body, variables)
                  : undefined,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
          responseStatus = response.status;
          const durationMs = Date.now() - started;
          const failures: string[] = [];
          if (
            !testRequest.assertions.every(
              (assertion) => assertion.expectedStatus === response.status,
            )
          )
            failures.push(
              `Expected status ${testRequest.assertions.map((assertion) => assertion.expectedStatus).join(", ")}, received ${response.status}`,
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
            const responseBody = await readResponseBody(
              response,
              config.MAX_TARGET_RESPONSE_BYTES,
            );
            let payload: Record<string, unknown> | undefined;
            try {
              payload = JSON.parse(responseBody) as Record<string, unknown>;
            } catch {
              failures.push("Response body is not valid JSON");
            }
            if (payload) {
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
                failures.push(`JSON path ${testRequest.jsonPath} did not match`);
            }
          } else await discardResponseBody(response);
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
            statusCode: responseStatus,
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
    const completed = await prisma.$transaction(async (transaction) => {
      const terminal = await transaction.executionRun.updateMany({
        where: { id: runId, status: "RUNNING" },
        data: { status, finishedAt: new Date(), heartbeatAt: new Date() },
      });
      if (terminal.count !== 1) return false;
      await transaction.requestResult.deleteMany({
        where: { executionRunId: runId },
      });
      await transaction.requestResult.createMany({
        data: results.map((result) => ({
          ...result,
          executionRunId: runId,
        })),
      });
      return true;
    });
    return completed;
  } catch (error) {
    throw error;
  }
}
