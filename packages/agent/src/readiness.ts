import type { CampaignProfile } from "@marlow/shared";

export type ReadinessResult = {
  score: number;
  missingRequiredFields: string[];
  unresolvedQuestions: string[];
  ready: boolean;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function calculateReadiness(profile: Partial<CampaignProfile>): ReadinessResult {
  const checks: Array<{ path: string; weight: number; valid: boolean; question: string }> = [
    {
      path: "campaignObjective",
      weight: 8,
      valid: hasText(profile.campaignObjective),
      question: "What outcome should this campaign create?",
    },
    {
      path: "sender.name",
      weight: 6,
      valid: hasText(profile.sender?.name),
      question: "Who should these emails come from?",
    },
    {
      path: "sender.companyName",
      weight: 6,
      valid: hasText(profile.sender?.companyName),
      question: "What is your company name?",
    },
    {
      path: "sender.companyWebsite",
      weight: 6,
      valid: hasText(profile.sender?.companyWebsite),
      question: "What is your company website?",
    },
    {
      path: "sender.signature",
      weight: 4,
      valid: hasText(profile.sender?.signature),
      question: "What signature should appear on the email?",
    },
    {
      path: "sender.postalAddress",
      weight: 6,
      valid: hasText(profile.sender?.postalAddress),
      question: "What valid postal address should appear in the compliance footer?",
    },
    {
      path: "offer.summary",
      weight: 8,
      valid: hasText(profile.offer?.summary),
      question: "In a sentence, what are you offering?",
    },
    {
      path: "offer.primaryValue",
      weight: 7,
      valid: hasText(profile.offer?.primaryValue),
      question: "What is the primary value a buyer gets?",
    },
    {
      path: "offer.painsSolved",
      weight: 7,
      valid: hasItems(profile.offer?.painsSolved),
      question: "Which buyer problems does this solve?",
    },
    {
      path: "offer.callToAction",
      weight: 5,
      valid: hasText(profile.offer?.callToAction),
      question: "What simple next step should the email ask for?",
    },
    {
      path: "targetAccount.industries",
      weight: 8,
      valid: hasItems(profile.targetAccount?.industries),
      question: "Which industries are the best fit?",
    },
    {
      path: "targetPersonas",
      weight: 10,
      valid: hasItems(profile.targetPersonas),
      question: "Which roles or titles should we reach?",
    },
    {
      path: "limits.requestedProspects",
      weight: 5,
      valid: typeof profile.limits?.requestedProspects === "number",
      question: "How many qualified prospects should I prepare?",
    },
    {
      path: "limits.dailySendLimit",
      weight: 5,
      valid: typeof profile.limits?.dailySendLimit === "number",
      question: "What daily send cap should I enforce?",
    },
    {
      path: "limits.apolloCreditBudget",
      weight: 5,
      valid: typeof profile.limits?.apolloCreditBudget === "number",
      question: "What Apollo credit budget can I use?",
    },
    {
      path: "messaging.tone",
      weight: 4,
      valid: hasText(profile.messaging?.tone),
      question: "How should the email sound?",
    },
  ];
  const missing = checks.filter((check) => !check.valid);
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks
    .filter((check) => check.valid)
    .reduce((sum, check) => sum + check.weight, 0);
  const score = Math.round((earned / total) * 100);
  return {
    score,
    missingRequiredFields: missing.map((check) => check.path),
    unresolvedQuestions: missing.map((check) => check.question),
    ready:
      score >= 85 &&
      missing.every(
        (check) =>
          ![
            "campaignObjective",
            "sender.companyWebsite",
            "offer.summary",
            "targetAccount.industries",
            "targetPersonas",
            "sender.postalAddress",
          ].includes(check.path),
      ),
  };
}
