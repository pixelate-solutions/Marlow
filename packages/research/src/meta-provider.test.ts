import { describe, expect, it } from "vitest";
import {
  officialWebsiteFallbackResearch,
  unavailableWebsiteFallbackResearch,
} from "./meta-provider";

describe("official website research fallback", () => {
  it("creates a sourced claim when broader grounding is unavailable", () => {
    const result = officialWebsiteFallbackResearch("Example Co", {
      url: "https://example.com/",
      title: "Example Co Operations",
      text: "Example Co provides industrial services.",
      retrievedAt: "2026-07-21T02:00:00.000Z",
      contentType: "text/html",
    });

    expect(result.claims).toEqual([
      expect.objectContaining({
        sourceUrl: "https://example.com/",
        sourceType: "official_company",
        confidence: "medium",
      }),
    ]);
    expect(result.uncertainty).toHaveLength(1);
  });

  it("returns an evidence-free result when both research paths are unavailable", () => {
    const result = unavailableWebsiteFallbackResearch(
      "Example Co",
      "https://example.invalid/",
    );

    expect(result.claims).toEqual([]);
    expect(result.signals).toEqual([]);
    expect(result.uncertainty).toHaveLength(1);
  });
});
