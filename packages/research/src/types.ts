import type { ResearchClaim } from "@marlow/shared";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
};

export type RetrievedPage = {
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
  contentType: string;
};

export type CompanyResearch = {
  summary: string;
  signals: string[];
  claims: ResearchClaim[];
  uncertainty: string[];
};

export interface WebResearchProvider {
  search(
    query: string,
    options?: { domains?: string[]; maxResults?: number },
  ): Promise<SearchResult[]>;
  fetchPage(url: string): Promise<RetrievedPage>;
  researchCompany(input: {
    companyName: string;
    websiteUrl: string;
    prospectTitle: string;
    campaignContext: string;
  }): Promise<CompanyResearch>;
}

export class ResearchError extends Error {
  constructor(
    public readonly code: "SEARCH_UNAVAILABLE" | "FETCH_BLOCKED" | "INVALID_RESPONSE",
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}
