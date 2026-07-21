import { describe, expect, it } from "vitest";
import {
  campaignOutcomeStatus,
  qualificationBatches,
  restrictSupportingClaimIds,
} from "./orchestrator";

describe("qualification batches", () => {
  it("keeps model qualification requests within the configured batch size", () => {
    const items = Array.from({ length: 25 }, (_, index) => index + 1);

    const result = qualificationBatches(items);

    expect(result).toHaveLength(3);
    expect(result.map((batch) => batch.length)).toEqual([12, 12, 1]);
    expect(result.flat()).toEqual(items);
  });
});

describe("campaign outcome status", () => {
  it("requires attention when a run creates no drafts", () => {
    expect(campaignOutcomeStatus(0)).toBe("FAILED");
    expect(campaignOutcomeStatus(1)).toBe("PENDING_USER_APPROVAL");
  });
});

describe("supporting claim IDs", () => {
  it("keeps only verified claim IDs after model review", () => {
    const draft = {
      subject: "A grounded subject",
      body: "A grounded email body.",
      personalizationSummary: "Relevant public signal",
      selectedAngle: "Operational efficiency",
      qualificationSummary: "Matches the target profile",
      supportingClaimIds: ["claim-1", "March 13 2025 factory claim", "claim-2"],
      confidence: 74,
      complianceWarnings: [],
    };

    expect(restrictSupportingClaimIds(draft, ["claim-1", "claim-2"])).toEqual({
      ...draft,
      supportingClaimIds: ["claim-1", "claim-2"],
    });
  });
});
