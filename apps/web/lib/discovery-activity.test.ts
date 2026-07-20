import { describe, expect, it } from "vitest";
import { readDiscoveryActivities } from "./discovery-activity";

describe("discovery activity", () => {
  it("keeps only safe public activity fields", () => {
    expect(
      readDiscoveryActivities([
        {
          id: "model",
          kind: "model",
          label: "Muse Spark 1.1",
          detail: "The model returned a structured discovery turn.",
          status: "complete",
          durationMs: 1250,
          hiddenPrompt: "do not expose",
        },
        { id: "invalid", label: "Incomplete" },
      ]),
    ).toEqual([
      {
        id: "model",
        kind: "model",
        label: "Muse Spark 1.1",
        detail: "The model returned a structured discovery turn.",
        status: "complete",
        durationMs: 1250,
      },
    ]);
  });
});
