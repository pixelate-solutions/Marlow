import type { SendingSettings } from "./schemas";

type SendingWindowSettings = Pick<
  SendingSettings,
  "allowedDays" | "quietHoursEnd" | "quietHoursStart" | "timezone"
>;

export type SendingWindowDecision =
  | { allowed: true }
  | { allowed: false; reason: "DISALLOWED_DAY" | "INVALID_TIMEZONE" | "QUIET_HOURS" };

const weekdays = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
]);

function minutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function evaluateSendingWindow(
  settings: SendingWindowSettings,
  at = new Date(),
): SendingWindowDecision {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return { allowed: false, reason: "INVALID_TIMEZONE" };
  }

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const day = weekdays.get(part("weekday"));
  if (day === undefined || !settings.allowedDays.includes(day)) {
    return { allowed: false, reason: "DISALLOWED_DAY" };
  }

  const current = Number(part("hour")) * 60 + Number(part("minute"));
  const start = minutes(settings.quietHoursStart);
  const end = minutes(settings.quietHoursEnd);
  const quiet =
    start < end
      ? current >= start && current < end
      : start > end && (current >= start || current < end);
  return quiet ? { allowed: false, reason: "QUIET_HOURS" } : { allowed: true };
}
