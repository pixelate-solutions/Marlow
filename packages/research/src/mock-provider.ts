import type { CompanyResearch, RetrievedPage, SearchResult, WebResearchProvider } from "./types";

export class MockResearchProvider implements WebResearchProvider {
  async search(query: string): Promise<SearchResult[]> {
    return [
      {
        title: "Acme Careers (demo)",
        url: "https://acme.example/careers",
        snippet: `Deterministic demo result for ${query}`,
      },
    ];
  }

  async fetchPage(url: string): Promise<RetrievedPage> {
    return {
      url,
      title: "Demo public page",
      text: "Acme is hiring operations analysts to support its growing Midwest footprint.",
      retrievedAt: "2026-07-19T00:00:00.000Z",
      contentType: "text/html",
    };
  }

  async researchCompany(input: {
    companyName: string;
    websiteUrl: string;
    prospectTitle: string;
    campaignContext: string;
  }): Promise<CompanyResearch> {
    return {
      summary: `${input.companyName} is expanding its operations organization (deterministic demo research).`,
      signals: ["Hiring operations analysts", "Expanding Midwest facilities"],
      claims: [
        {
          claim: `${input.companyName} is hiring operations analysts.`,
          sourceUrl: `${input.websiteUrl}/careers`,
          sourceTitle: `${input.companyName} Careers (demo)`,
          retrievedAt: "2026-07-19T00:00:00.000Z",
          confidence: "high",
          sourceType: "job_posting",
        },
      ],
      uncertainty: [
        "The hiring signal is deterministic demo data and must not be sent in production.",
      ],
    };
  }
}
