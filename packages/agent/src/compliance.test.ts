import { describe, expect, it } from "vitest";
import {
  explicitlyRequestsEmDashes,
  matchesSuppression,
  validateEmailCompliance,
} from "./compliance";

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

  it("rejects em dashes unless a user explicitly requests them", () => {
    const mark = String.fromCodePoint(0x2014);
    const input = {
      subject: "Scaling operations",
      body: `Maya, Acme is expanding its operations team ${mark} a change that can make reporting harder across facilities. Northstar helps growing teams keep handoffs consistent without replacing current tools. Would comparing notes for 15 minutes next week be useful?`,
    };

    const defaultResult = validateEmailCompliance(input);
    expect(defaultResult.valid).toBe(false);
    expect(defaultResult.warnings.join(" ")).toMatch(/em dash/i);

    const requestedResult = validateEmailCompliance({ ...input, allowEmDashes: true });
    expect(requestedResult.valid).toBe(true);
    expect(requestedResult.warnings).not.toContain(
      "Email contains an em dash; use commas, periods, colons, or parentheses instead.",
    );
  });

  it("only recognizes a positive, explicit style request", () => {
    expect(explicitlyRequestsEmDashes("Please use em dashes in this email.")).toBe(true);
    expect(explicitlyRequestsEmDashes("Never use em dashes.")).toBe(false);
    expect(
      explicitlyRequestsEmDashes(
        "Do not use em dashes in this revision.",
        "I prefer em dashes in campaign copy.",
      ),
    ).toBe(false);
  });
});
