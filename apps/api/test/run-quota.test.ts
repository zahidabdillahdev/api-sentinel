import { describe, expect, it } from "vitest";
import {
  ActiveRunQuotaExceededError,
  assertActiveRunQuota,
} from "../src/lib/run-quota.js";

describe("active run quota", () => {
  it("allows a run below the configured limit", () => {
    expect(() => assertActiveRunQuota(4, 5)).not.toThrow();
  });

  it("rejects a run when the limit has been reached", () => {
    expect(() => assertActiveRunQuota(5, 5)).toThrow(
      ActiveRunQuotaExceededError,
    );
  });

  it("rejects a run above the configured limit", () => {
    expect(() => assertActiveRunQuota(6, 5)).toThrow(
      "Organization already has 5 active collection runs",
    );
  });
});
