import { describe, expect, it } from "vitest";
import type { CampaignProfile } from "@marlow/shared";
import { calculateLeadScore } from "./scoring";

const profile: CampaignProfile = {
  campaignObjective: "Book meetings",
  sender: {
    name: "Alex",
    companyName: "Northstar",
    companyWebsite: "https://northstar.example",
    signature: "Alex",
    postalAddress: "123 Main St",
  },
  offer: {
    productOrService: "Software",
    summary: "Operations analytics",
    primaryValue: "Clear reporting",
    painsSolved: ["Reporting friction"],
    differentiators: [],
    approvedProof: [],
    callToAction: "15 minute call",
  },
  targetAccount: {
    industries: ["Industrial automation"],
    employeeRange: { min: 100, max: 1000 },
    locations: ["Detroit"],
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
  messaging: { tone: "Direct", maximumWords: 120, bannedPhrases: [] },
  limits: { requestedProspects: 10, dailySendLimit: 10, apolloCreditBudget: 20 },
  readiness: { score: 100, missingRequiredFields: [], unresolvedQuestions: [] },
};

describe("lead scoring", () => {
  it("produces an explainable bounded score", () => {
    const result = calculateLeadScore({
      profile,
      company: {
        id: "c1",
        name: "Acme",
        domain: "acme.example",
        industry: "Industrial automation",
        employeeCount: 400,
        location: "Detroit, MI",
        technologies: [],
        keywords: [],
      },
      person: {
        personId: "p1",
        companyId: "c1",
        firstName: "Maya",
        lastName: "Chen",
        title: "VP of Operations",
        email: "maya@acme.example",
        emailStatus: "verified",
      },
      claims: [
        {
          claim: "Acme is hiring operations analysts.",
          sourceUrl: "https://acme.example/careers",
          retrievedAt: "2026-07-19T00:00:00.000Z",
          confidence: "high",
          sourceType: "job_posting",
        },
      ],
      hasBuyingSignal: true,
      painPointSupported: true,
    });
    expect(result.total).toBeGreaterThanOrEqual(85);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.explanation).toContain(`${result.total}/100`);
  });

  it("hard-penalizes disqualified accounts", () => {
    const result = calculateLeadScore({
      profile,
      company: { id: "c", name: "Bad", domain: "bad.example", technologies: [], keywords: [] },
      person: { personId: "p", companyId: "c", firstName: "A", lastName: "B", title: "Intern" },
      claims: [],
      hasBuyingSignal: false,
      painPointSupported: false,
      disqualified: true,
    });
    expect(result.total).toBe(0);
  });

  it("uses the company name when Apollo omits industry metadata", () => {
    const result = calculateLeadScore({
      profile: {
        ...profile,
        targetAccount: {
          ...profile.targetAccount,
          industries: ["Equipment Manufacturing"],
          keywords: ["equipment"],
        },
      },
      company: {
        id: "c",
        name: "Reliable Equipment Manufacturing Co.",
        domain: "reliable.example",
        technologies: [],
        keywords: [],
      },
      person: {
        personId: "p",
        companyId: "c",
        firstName: "A",
        lastName: "B",
        title: "VP of Operations",
        email: "a@reliable.example",
        emailStatus: "verified",
      },
      claims: [],
      hasBuyingSignal: false,
      painPointSupported: false,
    });

    expect(result.components.industryMatch).toBe(15);
  });
});
