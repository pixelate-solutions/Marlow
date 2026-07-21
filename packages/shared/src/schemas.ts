import { z } from "zod";
import { CAMPAIGN_STATUSES, DEFAULTS } from "./constants";

const nonEmpty = z.string().trim().min(1);

export const campaignProfileSchema = z.object({
  campaignObjective: nonEmpty,
  sender: z.object({
    name: nonEmpty,
    title: z.string().trim().optional(),
    companyName: nonEmpty,
    companyWebsite: z.url(),
    sendingMailboxId: z.string().trim().optional(),
    signature: nonEmpty,
    postalAddress: nonEmpty,
  }),
  offer: z.object({
    productOrService: nonEmpty,
    summary: nonEmpty,
    primaryValue: nonEmpty,
    painsSolved: z.array(nonEmpty).min(1),
    differentiators: z.array(nonEmpty).default([]),
    approvedProof: z.array(z.object({ claim: nonEmpty, source: z.url().optional() })).default([]),
    callToAction: nonEmpty,
  }),
  targetAccount: z.object({
    industries: z.array(nonEmpty).min(1),
    employeeRange: z
      .object({
        min: z.number().int().nonnegative().optional(),
        max: z.number().int().positive().optional(),
      })
      .optional(),
    revenueRange: z
      .object({
        min: z.number().nonnegative().optional(),
        max: z.number().positive().optional(),
        currency: z.string().length(3).default("USD"),
      })
      .optional(),
    locations: z.array(nonEmpty).default([]),
    technologies: z.array(nonEmpty).default([]),
    keywords: z.array(nonEmpty).default([]),
    buyingSignals: z.array(nonEmpty).default([]),
  }),
  targetPersonas: z
    .array(
      z.object({
        jobFunctions: z.array(nonEmpty).min(1),
        titles: z.array(nonEmpty).min(1),
        seniorities: z.array(nonEmpty).min(1),
        likelyResponsibilities: z.array(nonEmpty).default([]),
      }),
    )
    .min(1),
  disqualifiers: z.array(nonEmpty).default([]),
  messaging: z.object({
    tone: nonEmpty.default("Direct, warm, and conversational"),
    maximumWords: z.number().int().min(40).max(250).default(DEFAULTS.maximumEmailWords),
    bannedPhrases: z.array(nonEmpty).default([]),
    customInstructions: z.string().trim().optional(),
  }),
  limits: z.object({
    requestedProspects: z.number().int().min(1).max(500).default(DEFAULTS.requestedProspects),
    dailySendLimit: z.number().int().min(1).max(500).default(DEFAULTS.dailySendLimit),
    apolloCreditBudget: z.number().int().min(0).max(100_000).default(DEFAULTS.apolloCreditBudget),
  }),
  readiness: z.object({
    score: z.number().min(0).max(100),
    missingRequiredFields: z.array(z.string()),
    unresolvedQuestions: z.array(z.string()),
  }),
});

export type CampaignProfile = z.infer<typeof campaignProfileSchema>;

export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);

export const researchClaimSchema = z.object({
  id: z.uuid().optional(),
  claim: nonEmpty,
  sourceUrl: z.url(),
  sourceTitle: z.string().optional(),
  retrievedAt: z.iso.datetime(),
  confidence: z.enum(["high", "medium", "low"]),
  sourceType: z.enum([
    "official_company",
    "apollo",
    "official_press_release",
    "job_posting",
    "news",
    "other",
  ]),
});

export type ResearchClaim = z.infer<typeof researchClaimSchema>;

export const leadScoreComponentsSchema = z.object({
  industryMatch: z.number().min(0).max(15),
  companySizeMatch: z.number().min(0).max(10),
  geographyMatch: z.number().min(0).max(5),
  personaMatch: z.number().min(0).max(15),
  seniorityMatch: z.number().min(0).max(10),
  technologyMatch: z.number().min(0).max(8),
  painPointRelevance: z.number().min(0).max(12),
  buyingSignal: z.number().min(0).max(10),
  researchConfidence: z.number().min(0).max(8),
  contactability: z.number().min(0).max(7),
  disqualifierPenalty: z.number().min(-100).max(0).default(0),
});

export type LeadScoreComponents = z.infer<typeof leadScoreComponentsSchema>;

export function normalizeConfidencePercent(value: number): number {
  return Math.round(value > 0 && value < 1 ? value * 100 : value);
}

export const outreachDraftSchema = z.object({
  subject: nonEmpty.max(120),
  body: nonEmpty.max(10_000),
  personalizationSummary: nonEmpty,
  selectedAngle: nonEmpty,
  qualificationSummary: nonEmpty,
  supportingClaimIds: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  complianceWarnings: z.array(z.string()),
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

export const searchPlanSchema = z.object({
  industries: z.array(z.string()),
  companySizes: z.array(z.object({ min: z.number().optional(), max: z.number().optional() })),
  revenueRanges: z.array(
    z.object({ min: z.number().optional(), max: z.number().optional(), currency: z.string() }),
  ),
  geographies: z.array(z.string()),
  technologies: z.array(z.string()),
  keywords: z.array(z.string()),
  buyingSignals: z.array(z.string()),
  jobFunctions: z.array(z.string()),
  titles: z.array(z.string()),
  seniorities: z.array(z.string()),
  exclusions: z.array(z.string()),
});

export type SearchPlan = z.infer<typeof searchPlanSchema>;

export const approvalContextSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  prospectId: z.uuid(),
  draftId: z.uuid(),
  recipientEmail: z.email(),
  sendingMailboxId: nonEmpty,
  subjectHash: z.string().length(64),
  bodyHash: z.string().length(64),
  approvedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  nonce: z.string().min(32),
});

export type ApprovalContext = z.infer<typeof approvalContextSchema>;

export const sendingSettingsSchema = z.object({
  defaultMailboxId: z.string().trim().default(""),
  senderName: nonEmpty,
  senderTitle: z.string().default(""),
  postalAddress: nonEmpty,
  unsubscribeText: nonEmpty,
  unsubscribeUrl: z.union([z.url(), z.literal("")]).default(""),
  dailyLimit: z.number().int().min(1).max(500),
  organizationDailyLimit: z.number().int().min(1).max(5_000),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: nonEmpty,
  allowedDays: z.array(z.number().int().min(0).max(6)).min(1),
});

export type SendingSettings = z.infer<typeof sendingSettingsSchema>;

export const apiErrorCodes = [
  "AUTHENTICATION_REQUIRED",
  "INSUFFICIENT_PERMISSION",
  "APOLLO_NOT_CONNECTED",
  "APOLLO_REAUTHORIZATION_REQUIRED",
  "APOLLO_CREDIT_BUDGET_REACHED",
  "APOLLO_PERMISSION_DENIED",
  "MAILBOX_NOT_CONNECTED",
  "MAILBOX_REAUTHORIZATION_REQUIRED",
  "MAILBOX_PERMISSION_DENIED",
  "RECIPIENT_REPLIED",
  "PROSPECT_SUPPRESSED",
  "APPROVAL_EXPIRED",
  "APPROVAL_MISMATCH",
  "DAILY_LIMIT_REACHED",
  "OUTSIDE_SENDING_WINDOW",
  "DUPLICATE_SEND_PREVENTED",
  "MODEL_UNAVAILABLE",
  "SEARCH_UNAVAILABLE",
  "WORKER_UNAVAILABLE",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];
