export const PRODUCT = {
  name: "Marlow",
  temporaryName: "Outbound Agent",
  description: "Your AI outbound teammate",
} as const;

export const MODEL = {
  provider: "meta",
  id: "muse-spark-1.1",
  baseUrl: "https://api.meta.ai/v1",
} as const;

export const DEFAULTS = {
  dailySendLimit: 25,
  apolloCreditBudget: 100,
  requestedProspects: 25,
  minimumLeadScore: 70,
  approvalTtlSeconds: 300,
  maximumEmailWords: 120,
  agentMaxToolCalls: 40,
  agentMaxRunMinutes: 20,
} as const;

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "DISCOVERING",
  "READY",
  "QUEUED",
  "SEARCHING_ACCOUNTS",
  "QUALIFYING_ACCOUNTS",
  "SEARCHING_PEOPLE",
  "ENRICHING",
  "RESEARCHING",
  "SCORING",
  "WRITING",
  "QUALITY_REVIEW",
  "PENDING_USER_APPROVAL",
  "APPROVED",
  "SENDING",
  "SENT",
  "SKIPPED",
  "PAUSED",
  "FAILED",
  "COMPLETED",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
