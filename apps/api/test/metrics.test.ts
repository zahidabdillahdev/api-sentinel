import { describe, expect, it } from "vitest";
import { summarizeRuns } from "../src/lib/metrics.js";

describe("project metrics", () => {
  it("summarizes terminal and active run states", () => {
    expect(
      summarizeRuns([
        { status: "PASSED", _count: { _all: 8 } },
        { status: "FAILED", _count: { _all: 2 } },
        { status: "RUNNING", _count: { _all: 1 } },
      ]),
    ).toEqual({
      total: 11,
      queued: 0,
      running: 1,
      passed: 8,
      failed: 2,
      passRate: 80,
    });
  });

  it("returns a null pass rate when no run has finished", () => {
    expect(
      summarizeRuns([{ status: "QUEUED", _count: { _all: 2 } }]).passRate,
    ).toBeNull();
  });
});
