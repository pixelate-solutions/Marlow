import { describe, expect, it } from "vitest";
import { matchesSuppression, validateEmailCompliance } from "./compliance";

describe("email compliance", () => {
  it("rejects banned filler and spam-like subjects", () => {
    const result = validateEmailCompliance({
      subject: "FREE!!!",
      body: "I hope this email finds you well. This is a longer sentence that explains our useful service and asks whether a short conversation next week would be worthwhile for your operations team.",
    });
    expect(result.valid).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/banned phrase/i);
  });

  it("matches organization-wide email and domain suppressions", () => {
    expect(
      matchesSuppression({ email: "Maya@Acme.com" }, [{ type: "DOMAIN", value: "acme.com" }]),
    ).toBe(true);
  });
});
