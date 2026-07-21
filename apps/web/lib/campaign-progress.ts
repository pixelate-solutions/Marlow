export const campaignWorkflowSteps = [
  "Search",
  "Qualify",
  "Enrich",
  "Research",
  "Write",
  "Review",
] as const;

export type CampaignRunEvent = {
  sequence: number;
  type: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};

const statusStage: Record<string, number> = {
  QUEUED: 0,
  SEARCHING_ACCOUNTS: 0,
  QUALIFYING_ACCOUNTS: 1,
  SEARCHING_PEOPLE: 1,
  ENRICHING: 2,
  RESEARCHING: 3,
  SCORING: 3,
  WRITING: 4,
  QUALITY_REVIEW: 4,
  PENDING_USER_APPROVAL: 5,
  APPROVED: 5,
  SENDING: 5,
  SENT: 6,
  COMPLETED: 6,
};

function eventStage(message: string): number | null {
  const normalized = message.toLowerCase();
  if (/ready for approval|draft/.test(normalized)) return 5;
  if (/preparing|writing|quality/.test(normalized)) return 4;
  if (/researching|scored|evidence/.test(normalized)) return 3;
  if (/enrich/.test(normalized)) return 2;
  if (/reviewing|qualif|people/.test(normalized)) return 1;
  if (/searching|worker picked up/.test(normalized)) return 0;
  return null;
}

export function getCampaignWorkflowStage(status: string, events: CampaignRunEvent[]): number {
  const latestStage = [...events]
    .reverse()
    .map((event) => eventStage(event.message))
    .find((stage): stage is number => stage !== null);
  return Math.max(statusStage[status] ?? 0, latestStage ?? 0);
}

export function getCampaignProgress(status: string, events: CampaignRunEvent[]): number {
  const stage = getCampaignWorkflowStage(status, events);
  const stageProgress = [10, 30, 50, 65, 82, 94, 100];
  return stageProgress[Math.min(stage, stageProgress.length - 1)] ?? 0;
}

export function getCampaignActivityLabel(status: string, runStatus: string | null): string {
  if (status === "PAUSED") return "Paused";
  if (status === "FAILED" || runStatus === "FAILED") return "Needs attention";
  if (status === "PENDING_USER_APPROVAL") return "Ready for review";
  if (["COMPLETED", "SENT"].includes(status)) return "Complete";
  if (runStatus === "SUCCEEDED") return "Complete";
  if (runStatus === "RUNNING") return "Working";
  return "Queued";
}

export function getCampaignActivityTone(
  status: string,
  runStatus: string | null,
): "info" | "neutral" | "success" | "warning" {
  const label = getCampaignActivityLabel(status, runStatus);
  if (label === "Complete") return "success";
  if (label === "Needs attention") return "warning";
  if (label === "Paused") return "neutral";
  return "info";
}

export function formatActivityTime(createdAt: string, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1_000));
  if (elapsedSeconds < 60) return "Now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
