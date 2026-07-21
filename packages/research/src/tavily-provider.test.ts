import { describe, expect, it, vi } from "vitest";
import {
  TavilyResearchProvider,
  tavilyCompanySearchQuery,
  tavilyResultsToResearch,
} from "./tavily-provider";

describe("Tavily research provider", () => {
  it("converts Tavily results into source-backed research claims", () => {
    const research = tavilyResultsToResearch(
      "Example Co",
      "https://example.com",
      [
        {
          title: "Example Co Careers",
          url: "https://example.com/careers",
          content: "Example Co is hiring operations analysts to support its growing service team.",
          score: 0.91,
        },
      ],
      "2026-07-21T03:00:00.000Z",
    );

    expect(research.claims).toEqual([
      expect.objectContaining({
        sourceUrl: "https://example.com/careers",
        sourceType: "official_company",
        confidence: "high",
      }),
    ]);
  });

  it("uses bearer authentication for Tavily Search", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "Example Co",
                url: "https://example.com",
                content: "Example Co provides industrial automation services.",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const provider = new TavilyResearchProvider({ apiKey: "tvly-test", fetchImpl });

    const results = await provider.search("Example Co", { maxResults: 3 });

    expect(results).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://api.tavily.com/search"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tvly-test" }),
      }),
    );
  });

  it("excludes unrelated third-party results from company evidence", () => {
    const research = tavilyResultsToResearch("Hoffman Equipment", "https://hoffmanequip.com", [
      {
        title: "Generic workflow automation advice",
        url: "https://consulting.example/workflow-automation",
        content: "Manufacturers can replace spreadsheets with connected workflow tools.",
      },
      {
        title: "Hoffman Equipment opens a new location",
        url: "https://industry-news.example/hoffman-equipment-location",
        content:
          "Hoffman Equipment opened a new location to support its growing service footprint.",
      },
    ]);

    expect(research.claims).toHaveLength(1);
    expect(research.claims[0]?.sourceUrl).toContain("hoffman-equipment-location");
  });

  it("builds a focused query from campaign pains and buying signals", () => {
    const query = tavilyCompanySearchQuery({
      companyName: "Example Manufacturing",
      websiteUrl: "https://example.com",
      prospectTitle: "VP Operations",
      campaignContext: JSON.stringify({
        pains: ["Manual data entry between disconnected systems"],
        buyingSignals: ["Outgrown spreadsheets and disconnected tools"],
      }),
    });

    expect(query).toContain('"Example Manufacturing"');
    expect(query).toContain("Manual data entry");
    expect(query).toContain("Outgrown spreadsheets");
    expect(query.length).toBeLessThanOrEqual(390);
  });
});
