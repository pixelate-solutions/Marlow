export type DiscoveryActivity = {
  id: string;
  kind: "tool" | "model" | "validation" | "recovery";
  label: string;
  detail: string;
  status: "running" | "complete" | "warning";
  durationMs?: number;
};

export function readDiscoveryActivities(value: unknown): DiscoveryActivity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const activity = entry as Record<string, unknown>;
    if (
      typeof activity.id !== "string" ||
      !["tool", "model", "validation", "recovery"].includes(String(activity.kind)) ||
      typeof activity.label !== "string" ||
      typeof activity.detail !== "string" ||
      !["running", "complete", "warning"].includes(String(activity.status))
    )
      return [];
    return [
      {
        id: activity.id,
        kind: activity.kind as DiscoveryActivity["kind"],
        label: activity.label,
        detail: activity.detail,
        status: activity.status as DiscoveryActivity["status"],
        ...(typeof activity.durationMs === "number" ? { durationMs: activity.durationMs } : {}),
      },
    ];
  });
}
