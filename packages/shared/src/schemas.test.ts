import { describe, expect, it } from "vitest";
import {
  campaignProfileSchema,
  normalizeConfidencePercent,
  outreachDraftSchema,
  sendingSettingsSchema,
} from "./schemas";

describe("campaign profile schema", () => {
  const valid = {
    campaignObjective: "Book qualified operations calls",
    sender: {
      name: "Alex Morgan",
      companyName: "Northstar",
      companyWebsite: "https://northstar.example",
      signature: "Alex",
      postalAddress: "123 Main St, Detroit, MI",
    },
    offer: {
      productOrService: "Software",
      summary: "Workflow analytics for operations teams",
      primaryValue: "Clear daily visibility",
      painsSolved: ["Inconsistent reporting"],
      differentiators: [],
      approvedProof: [],
      callToAction: "A 15-minute comparison",
    },
    targetAccount: {
      industries: ["Manufacturing"],
      locations: ["United States"],
      technologies: [],
      keywords: [],
      buyingSignals: [],
    },
    targetPersonas: [
      {
        jobFunctions: ["Operations"],
        titles: ["VP of Operations"],
        seniorities: ["VP"],
        likelyResponsibilities: [],
      },
    ],
    disqualifiers: [],
    messaging: { tone: "Direct and conversational", maximumWords: 120, bannedPhrases: [] },
    limits: { requestedProspects: 25, dailySendLimit: 25, apolloCreditBudget: 100 },
    readiness: { score: 100, missingRequiredFields: [], unresolvedQuestions: [] },
  };

  it("accepts a complete tenant campaign profile", () => {
    expect(campaignProfileSchema.parse(valid).sender.companyName).toBe("Northstar");
  });

  it("rejects campaigns without a target persona", () => {
    expect(() => campaignProfileSchema.parse({ ...valid, targetPersonas: [] })).toThrow();
  });

  it("rejects an unsafe daily sending cap", () => {
    expect(() =>
      campaignProfileSchema.parse({
        ...valid,
        limits: { ...valid.limits, dailySendLimit: 50_000 },
      }),
    ).toThrow();
  });
});

describe("sending settings schema", () => {
  it("requires at least one allowed sending day", () => {
    expect(() =>
      sendingSettingsSchema.parse({
        senderName: "Alex",
        senderTitle: "",
        postalAddress: "123 Main St",
        unsubscribeText: "Reply to opt out",
        unsubscribeUrl: "",
        dailyLimit: 25,
        organizationDailyLimit: 100,
        quietHoursStart: "18:00",
        quietHoursEnd: "08:00",
        timezone: "UTC",
        allowedDays: [],
      }),
    ).toThrow();
  });
});

describe("outreach draft schema", () => {
  it("normalizes fractional model confidence to an integer percentage", () => {
    const draft = outreachDraftSchema.parse({
      subject: "Operations question",
      body: "Would a short conversation be worthwhile?",
      personalizationSummary: "Relevant operations role",
      selectedAngle: "Workflow complexity",
      qualificationSummary: "Matches the campaign criteria",
      supportingClaimIds: [],
      confidence: 0.7,
      complianceWarnings: [],
    });

    expect(normalizeConfidencePercent(draft.confidence)).toBe(70);
  });
});
