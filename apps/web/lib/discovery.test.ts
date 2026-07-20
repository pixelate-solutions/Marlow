import { describe, expect, it } from "vitest";
import { recoveryDiscoveryTurn } from "./discovery";

describe("discovery model recovery", () => {
  it("continues with the next unanswered question after a transient model failure", () => {
    const turn = recoveryDiscoveryTurn([
      {
        role: "user",
        content:
          "Our website is https://www.pixelate.solutions. Focus on the US and companies with 20-200 employees.",
      },
    ]);

    expect(turn.ready).toBe(false);
    expect(turn.missingRequiredFields).toEqual(["offer.approvedProof"]);
    expect(turn.assistantMessage).toMatch(/proof or client outcomes/i);
  });

  it("does not repeat proof or call-to-action questions that were answered", () => {
    const turn = recoveryDiscoveryTurn([
      {
        role: "user",
        content:
          "Website: https://example.com. Target nationwide US companies with 25-100 employees.",
      },
      {
        role: "user",
        content:
          "We have an approved client outcome and the call to action is to book a 15-minute meeting.",
      },
    ]);

    expect(turn.missingRequiredFields).toEqual(["limits.dailySendLimit"]);
    expect(turn.assistantMessage).toMatch(/daily sending limit/i);
  });
});
