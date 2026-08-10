import { describe, expect, it } from "vitest";
import { staleRunCutoff } from "../src/lib/run-recovery.js";

describe("stale run recovery", () => {
  it("calculates a deterministic recovery cutoff", () => {
    expect(
      staleRunCutoff(
        300,
        new Date("2026-08-10T10:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-08-10T09:55:00.000Z");
  });
});
