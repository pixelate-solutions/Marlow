import { describe, expect, it } from "vitest";
import { calculateReadiness } from "./readiness";

describe("campaign readiness", () => {
  it("identifies required missing information and asks one actionable question", () => {
    const result = calculateReadiness({ campaignObjective: "Book meetings" });
    expect(result.ready).toBe(false);
    expect(result.missingRequiredFields).toContain("sender.companyWebsite");
    expect(result.unresolvedQuestions[0]).toMatch(/emails come from/i);
  });
});
