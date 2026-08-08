import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { decrypt, encrypt } from "../src/lib/encryption.js";

describe("environment secret encryption", () => {
  const original = config.ENCRYPTION_KEY;
  beforeEach(() => {
    config.ENCRYPTION_KEY = "ab".repeat(32);
  });
  afterEach(() => {
    config.ENCRYPTION_KEY = original;
  });

  it("round-trips without storing plaintext", () => {
    const encrypted = encrypt("private-token");
    expect(encrypted.ciphertext).not.toContain("private-token");
    expect(decrypt(encrypted)).toBe("private-token");
  });

  it("rejects modified authentication tags", () => {
    const encrypted = encrypt("private-token");
    expect(() =>
      decrypt({ ...encrypted, authTag: Buffer.alloc(16).toString("base64") }),
    ).toThrow();
  });
});
