import { describe, expect, it } from "vitest";
import { buildReport } from "../src/client.js";

describe("CLI report", () => {
  it("creates a versioned machine-readable summary", () => {
    expect(
      buildReport({
        id: "run-1",
        status: "FAILED",
        createdAt: "2026-08-10T00:00:00.000Z",
        finishedAt: "2026-08-10T00:00:01.000Z",
        results: [
          {
            id: "result-1",
            statusCode: 500,
            durationMs: 25,
            error: "Expected status 200, received 500",
            passed: false,
            testRequest: { name: "Health", method: "GET", url: "https://api.example.com/health" },
          },
        ],
      }),
    ).toMatchObject({
      schemaVersion: "1.0",
      command: "run",
      summary: { total: 1, passed: 0, failed: 1 },
      results: [{ name: "Health", passed: false }],
    });
  });
});
