import { describe, expect, it } from "vitest";
import {
  formatActivityTime,
  getCampaignActivityLabel,
  getCampaignProgress,
  getCampaignWorkflowStage,
  type CampaignRunEvent,
} from "./campaign-progress";

const event = (message: string): CampaignRunEvent => ({
  sequence: 1,
  type: "AGENT_PROGRESS",
  message,
  data: {},
  createdAt: "2026-07-20T20:00:00.000Z",
});

describe("campaign progress", () => {
  it("keeps a newly queued campaign at the search step", () => {
    expect(getCampaignWorkflowStage("QUEUED", [])).toBe(0);
    expect(getCampaignProgress("QUEUED", [])).toBe(10);
    expect(getCampaignActivityLabel("QUEUED", "QUEUED")).toBe("Queued");
  });

  it("uses persisted activity to show the current workflow step", () => {
    expect(getCampaignWorkflowStage("SEARCHING_PEOPLE", [event("Researching Example Co.")])).toBe(
      3,
    );
    expect(getCampaignProgress("SEARCHING_PEOPLE", [event("Preparing an email.")])).toBe(82);
  });

  it("shows terminal and error labels", () => {
    expect(getCampaignActivityLabel("PENDING_USER_APPROVAL", "SUCCEEDED")).toBe(
      "Ready for review",
    );
    expect(getCampaignActivityLabel("FAILED", "FAILED")).toBe("Needs attention");
  });

  it("formats recent activity times", () => {
    const now = new Date("2026-07-20T20:05:00.000Z").getTime();
    expect(formatActivityTime("2026-07-20T20:04:40.000Z", now)).toBe("Now");
    expect(formatActivityTime("2026-07-20T20:01:00.000Z", now)).toBe("4m");
  });
});
