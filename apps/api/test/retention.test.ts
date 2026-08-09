import { describe, expect, it } from "vitest";
import { retentionCutoff } from "../src/lib/retention.js";

describe("run retention", () => {
  it("calculates the cutoff in whole configured days", () => {
    expect(
      retentionCutoff(30, new Date("2026-08-10T00:00:00.000Z")).toISOString(),
    ).toBe("2026-07-11T00:00:00.000Z");
  });
});
