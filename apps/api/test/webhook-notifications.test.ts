import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signWebhookPayload,
  webhookPayload,
} from "../src/lib/webhook-notifications.js";

describe("webhook notifications", () => {
  it("builds a stable failure payload without request secrets", () => {
    const payload = webhookPayload({
      runId: "run-1",
      collectionId: "collection-1",
      collectionName: "Public API",
      createdAt: new Date("2026-08-09T01:00:00.000Z"),
      finishedAt: new Date("2026-08-09T01:00:01.000Z"),
      failedRequests: 1,
      totalRequests: 2,
    });

    expect(payload).toMatchObject({
      schemaVersion: "1.0",
      event: "collection.run.failed",
      eventId: "run:run-1",
      data: {
        status: "FAILED",
        failedRequests: 1,
        totalRequests: 2,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("signs the exact body with HMAC-SHA256", () => {
    const body = '{"event":"collection.run.failed"}';
    const expected = createHmac("sha256", "signing-secret")
      .update(body)
      .digest("hex");

    expect(signWebhookPayload(body, "signing-secret")).toBe(
      `sha256=${expected}`,
    );
  });
});
