import type { CampaignStatus } from "@marlow/shared";

const transitions: Partial<Record<CampaignStatus, CampaignStatus[]>> = {
  DRAFT: ["DISCOVERING", "PAUSED"],
  DISCOVERING: ["READY", "PAUSED", "FAILED"],
  READY: ["QUEUED", "PAUSED"],
  QUEUED: ["SEARCHING_ACCOUNTS", "PAUSED", "FAILED"],
  SEARCHING_ACCOUNTS: ["QUALIFYING_ACCOUNTS", "PAUSED", "FAILED"],
  QUALIFYING_ACCOUNTS: ["SEARCHING_PEOPLE", "PAUSED", "FAILED"],
  SEARCHING_PEOPLE: ["ENRICHING", "RESEARCHING", "PAUSED", "FAILED"],
  ENRICHING: ["RESEARCHING", "PAUSED", "FAILED"],
  RESEARCHING: ["SCORING", "PAUSED", "FAILED"],
  SCORING: ["WRITING", "SKIPPED", "PAUSED", "FAILED"],
  WRITING: ["QUALITY_REVIEW", "SKIPPED", "PAUSED", "FAILED"],
  QUALITY_REVIEW: ["PENDING_USER_APPROVAL", "WRITING", "SKIPPED", "FAILED"],
  PENDING_USER_APPROVAL: ["APPROVED", "SKIPPED", "PAUSED"],
  APPROVED: ["SENDING", "PAUSED"],
  SENDING: ["SENT", "FAILED"],
  SENT: ["COMPLETED"],
  SKIPPED: ["SEARCHING_PEOPLE", "COMPLETED"],
  PAUSED: ["QUEUED", "PENDING_USER_APPROVAL"],
  FAILED: ["QUEUED"],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid campaign transition: ${from} → ${to}.`);
}
