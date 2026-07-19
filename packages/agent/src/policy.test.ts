import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "./policy";

describe("tool policy enforcement", () => {
  it("denies model access to the send tool even with a claimed approval", () => {
    expect(() =>
      createDefaultToolRegistry().authorize("apollo.send_one_off_email", {
        actor: "model",
        campaignPaused: false,
        creditsRemaining: 10,
        validApproval: true,
      }),
    ).toThrow(/cannot invoke send-capable/i);
  });
  it("denies enrichment once the credit budget is exhausted", () => {
    expect(() =>
      createDefaultToolRegistry().authorize("apollo.enrich_person", {
        actor: "worker",
        campaignPaused: false,
        creditsRemaining: 0,
        validApproval: false,
      }),
    ).toThrow(/budget/i);
  });
});
