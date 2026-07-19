import { describe, expect, it } from "vitest";
import { evaluateSendingWindow } from "./sending-window";

const settings = {
  timezone: "UTC",
  allowedDays: [1, 2, 3, 4, 5],
  quietHoursStart: "18:00",
  quietHoursEnd: "08:00",
};

describe("sending window", () => {
  it("allows a weekday outside quiet hours", () => {
    expect(evaluateSendingWindow(settings, new Date("2026-07-20T14:00:00Z"))).toEqual({
      allowed: true,
    });
  });

  it("blocks quiet hours that span midnight", () => {
    expect(evaluateSendingWindow(settings, new Date("2026-07-20T19:00:00Z"))).toEqual({
      allowed: false,
      reason: "QUIET_HOURS",
    });
  });

  it("blocks disallowed days and invalid timezones", () => {
    expect(evaluateSendingWindow(settings, new Date("2026-07-19T14:00:00Z"))).toEqual({
      allowed: false,
      reason: "DISALLOWED_DAY",
    });
    expect(evaluateSendingWindow({ ...settings, timezone: "Mars/Olympus" })).toEqual({
      allowed: false,
      reason: "INVALID_TIMEZONE",
    });
  });
});
