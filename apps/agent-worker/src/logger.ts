import { redactSecrets } from "@marlow/database";

export type LogContext = {
  agentRunId?: string | undefined;
  organizationId?: string | undefined;
  campaignId?: string | undefined;
  prospectId?: string | undefined;
  toolName?: string | undefined;
  durationMs?: number | undefined;
  retryCount?: number | undefined;
  workflowTransition?: string | undefined;
  sendOutcome?: string | undefined;
  [key: string]: unknown;
};

export function log(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context: LogContext = {},
): void {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    service: "marlow-agent-worker",
    message,
    ...(redactSecrets(context) as Record<string, unknown>),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}
