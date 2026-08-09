import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { decrypt } from "./encryption.js";
import { assertSafeTarget } from "./safe-url.js";

type EncryptedValue = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function signWebhookPayload(payload: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function webhookPayload(input: {
  runId: string;
  collectionId: string;
  collectionName: string;
  createdAt: Date;
  finishedAt: Date | null;
  failedRequests: number;
  totalRequests: number;
}) {
  return {
    schemaVersion: "1.0",
    event: "collection.run.failed",
    eventId: `run:${input.runId}`,
    occurredAt: (input.finishedAt ?? new Date()).toISOString(),
    data: {
      runId: input.runId,
      collection: {
        id: input.collectionId,
        name: input.collectionName,
      },
      status: "FAILED",
      failedRequests: input.failedRequests,
      totalRequests: input.totalRequests,
      startedAt: input.createdAt.toISOString(),
      finishedAt: input.finishedAt?.toISOString() ?? null,
    },
  };
}

function signingSecret(rule: {
  signingSecretCiphertext: string | null;
  signingSecretIv: string | null;
  signingSecretAuthTag: string | null;
}) {
  if (
    !rule.signingSecretCiphertext ||
    !rule.signingSecretIv ||
    !rule.signingSecretAuthTag
  )
    return undefined;
  return decrypt({
    ciphertext: rule.signingSecretCiphertext,
    iv: rule.signingSecretIv,
    authTag: rule.signingSecretAuthTag,
  });
}

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

export async function deliverFailureNotifications(
  prisma: PrismaClient,
  runId: string,
) {
  const run = await prisma.executionRun.findUnique({
    where: { id: runId },
    include: {
      results: { select: { passed: true } },
      collection: { include: { notificationRules: true } },
    },
  });
  if (!run || run.status !== "FAILED") return;

  const body = JSON.stringify(
    webhookPayload({
      runId: run.id,
      collectionId: run.collection.id,
      collectionName: run.collection.name,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      failedRequests: run.results.filter((result) => !result.passed).length,
      totalRequests: run.results.length,
    }),
  );

  await Promise.all(
    run.collection.notificationRules
      .filter((rule) => rule.enabled)
      .map(async (rule) => {
        const delivered = await prisma.webhookDelivery.findFirst({
          where: {
            notificationRuleId: rule.id,
            executionRunId: run.id,
            status: "DELIVERED",
          },
        });
        if (delivered) return;

        const endpoint: EncryptedValue = {
          ciphertext: rule.endpointCiphertext,
          iv: rule.endpointIv,
          authTag: rule.endpointAuthTag,
        };
        const url = decrypt(endpoint);
        const secret = signingSecret(rule);
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const started = Date.now();
          let responseStatus: number | undefined;
          let errorMessage: string | undefined;
          try {
            await assertSafeTarget(url);
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "user-agent": "API-Sentinel-Webhook/1.0",
                "x-api-sentinel-event": "collection.run.failed",
                "x-api-sentinel-event-id": `run:${run.id}`,
                ...(secret
                  ? { "x-api-sentinel-signature": signWebhookPayload(body, secret) }
                  : {}),
              },
              body,
              redirect: "error",
              signal: AbortSignal.timeout(10_000),
            });
            responseStatus = response.status;
            await response.body?.cancel();
            if (!response.ok)
              errorMessage = `Webhook responded with HTTP ${response.status}`;
          } catch {
            errorMessage = "Webhook request failed";
          }

          await prisma.webhookDelivery.upsert({
            where: {
              notificationRuleId_executionRunId_attempt: {
                notificationRuleId: rule.id,
                executionRunId: run.id,
                attempt,
              },
            },
            create: {
              notificationRuleId: rule.id,
              executionRunId: run.id,
              attempt,
              status: errorMessage ? "FAILED" : "DELIVERED",
              responseStatus,
              durationMs: Date.now() - started,
              error: errorMessage,
            },
            update: {
              status: errorMessage ? "FAILED" : "DELIVERED",
              responseStatus,
              durationMs: Date.now() - started,
              error: errorMessage,
            },
          });
          if (!errorMessage) return;
          if (attempt < 3) await wait(attempt * 1_000);
        }
      }),
  );
}
