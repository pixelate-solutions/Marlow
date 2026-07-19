import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, redactSecrets } from "./secrets";

describe("encrypted integration credentials", () => {
  it("round trips with AES-256-GCM", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptSecret("apollo-access-token", key);
    expect(encrypted.ciphertext).not.toContain("apollo");
    expect(decryptSecret(encrypted, key)).toBe("apollo-access-token");
  });

  it("redacts sensitive fields recursively", () => {
    expect(
      redactSecrets({ accessToken: "secret", nested: { cookie: "value", safe: "ok" } }),
    ).toEqual({
      accessToken: "[REDACTED]",
      nested: { cookie: "[REDACTED]", safe: "ok" },
    });
  });
});
