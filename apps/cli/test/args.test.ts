import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.js";

describe("CLI arguments", () => {
  it("uses environment credentials and normalizes the URL", () => {
    expect(
      parseArgs(["run", "--collection", "collection-1", "--output", "json"], {
        API_SENTINEL_URL: "https://sentinel.example.com/v1/",
        API_SENTINEL_TOKEN: "private-token",
      }),
    ).toMatchObject({
      apiUrl: "https://sentinel.example.com/v1",
      token: "private-token",
      collectionId: "collection-1",
      timeoutSeconds: 120,
      output: "json",
    });
  });

  it("rejects unsafe or ambiguous configuration", () => {
    expect(() =>
      parseArgs(
        ["run", "--collection", "collection-1", "--timeout", "5"],
        { API_SENTINEL_URL: "file:///tmp/api", API_SENTINEL_TOKEN: "token" },
      ),
    ).toThrow();
  });
});
