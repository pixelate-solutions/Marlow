import { describe, expect, it } from "vitest";
import { shouldStoreDiscoveryAnswer } from "./discovery-messages";

describe("discovery message retries", () => {
  it("does not store the same answer twice after a failed model turn", () => {
    expect(
      shouldStoreDiscoveryAnswer(
        [
          { role: "assistant", content: "Who owns the decision?" },
          { role: "user", content: "The COO owns it." },
        ],
        " The COO owns it. ",
      ),
    ).toBe(false);
  });

  it("stores a new answer after an assistant response", () => {
    expect(
      shouldStoreDiscoveryAnswer(
        [
          { role: "user", content: "The COO owns it." },
          { role: "assistant", content: "Which industries should I prioritize?" },
        ],
        "Manufacturing",
      ),
    ).toBe(true);
  });

  it("stores a changed answer after a failed model turn", () => {
    expect(
      shouldStoreDiscoveryAnswer(
        [{ role: "user", content: "The COO owns it." }],
        "The president and COO own it.",
      ),
    ).toBe(true);
  });
});
