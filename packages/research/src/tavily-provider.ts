import { z } from "zod";
import {
  officialWebsiteFallbackResearch,
  unavailableWebsiteFallbackResearch,
} from "./meta-provider";
import { fetchPublicPage } from "./public-fetch";
import {
  ResearchError,
  type CompanyResearch,
  type RetrievedPage,
  type SearchResult,
  type WebResearchProvider,
} from "./types";

const tavilyResultSchema = z.object({
  title: z.string(),
  url: z.url(),
  content: z.string(),
  raw_content: z.string().nullable().optional(),
  score: z.number().optional(),
  published_date: z.string().nullable().optional(),
});

const tavilySearchResponseSchema = z.object({
  results: z.array(tavilyResultSchema),
});

const tavilyExtractResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.url(),
      raw_content: z.string(),
    }),
  ),
});

type TavilyResult = z.infer<typeof tavilyResultSchema>;

function normalizedText(value: string): string {
  return value
    .replaceAll(String.fromCodePoint(8211), ", ")
    .replaceAll(String.fromCodePoint(8212), ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function conciseExcerpt(value: string): string | undefined {
  const text = normalizedText(value);
  if (text.length < 24) return undefined;
  const sentence = /^.{24,320}?[.!?](?:\s|$)/.exec(text)?.[0]?.trim();
  if (sentence) return sentence;
  return text.length <= 320 ? text : `${text.slice(0, 317).trimEnd()}...`;
}

function hostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function isOfficialSource(sourceUrl: string, websiteUrl: string): boolean {
  const sourceHost = hostname(sourceUrl);
  const websiteHost = hostname(websiteUrl);
  return Boolean(
    sourceHost &&
    websiteHost &&
    (sourceHost === websiteHost || sourceHost.endsWith(`.${websiteHost}`)),
  );
}

function sourceType(sourceUrl: string, websiteUrl: string) {
  if (isOfficialSource(sourceUrl, websiteUrl)) return "official_company" as const;
  if (/\b(careers?|jobs?|hiring)\b/i.test(sourceUrl)) return "job_posting" as const;
  if (/\b(news|press|release|article)\b/i.test(sourceUrl)) return "news" as const;
  return "other" as const;
}

export function tavilyResultsToResearch(
  companyName: string,
  websiteUrl: string,
  results: TavilyResult[],
  retrievedAt = new Date().toISOString(),
): CompanyResearch {
  const claims = results
    .map((result) => {
      const claim = conciseExcerpt(result.content || result.raw_content || "");
      if (!claim) return undefined;
      return {
        claim,
        sourceUrl: result.url,
        sourceTitle: normalizedText(result.title),
        retrievedAt,
        confidence: isOfficialSource(result.url, websiteUrl)
          ? ("high" as const)
          : ("medium" as const),
        sourceType: sourceType(result.url, websiteUrl),
      };
    })
    .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim))
    .slice(0, 5);

  return {
    summary:
      claims.length > 0
        ? `Tavily found ${claims.length} public source${claims.length === 1 ? "" : "s"} about ${companyName}.`
        : `Tavily did not return usable public evidence about ${companyName}.`,
    signals: claims.map((claim) => claim.claim),
    claims,
    uncertainty: [
      "Search result excerpts must be interpreted conservatively and checked against their linked sources.",
    ],
  };
}

export class TavilyResearchProvider implements WebResearchProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private async request(path: "/search" | "/extract", body: Record<string, unknown>) {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, this.options.baseUrl ?? "https://api.tavily.com"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ResearchError("SEARCH_UNAVAILABLE", "Tavily could not be reached.", true);
    }
    if (!response.ok) {
      throw new ResearchError(
        "SEARCH_UNAVAILABLE",
        response.status === 401 || response.status === 403
          ? "Tavily rejected the configured API key."
          : `Tavily returned HTTP ${response.status}.`,
        response.status === 429 || response.status >= 500,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ResearchError("INVALID_RESPONSE", "Tavily returned invalid JSON.");
    }
  }

  private async searchResults(
    query: string,
    options: { domains?: string[]; maxResults?: number } = {},
  ): Promise<TavilyResult[]> {
    const payload = await this.request("/search", {
      query,
      topic: "general",
      search_depth: "advanced",
      max_results: options.maxResults ?? 8,
      include_answer: false,
      include_raw_content: false,
      ...(options.domains?.length ? { include_domains: options.domains } : {}),
    });
    try {
      return tavilySearchResponseSchema.parse(payload).results;
    } catch {
      throw new ResearchError("INVALID_RESPONSE", "Tavily returned an invalid search result.");
    }
  }

  async search(
    query: string,
    options: { domains?: string[]; maxResults?: number } = {},
  ): Promise<SearchResult[]> {
    const results = await this.searchResults(query, options);
    return results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
      ...(result.published_date ? { publishedAt: result.published_date } : {}),
    }));
  }

  async fetchPage(url: string): Promise<RetrievedPage> {
    try {
      const payload = await this.request("/extract", {
        urls: [url],
        extract_depth: "advanced",
        format: "text",
      });
      const result = tavilyExtractResponseSchema.parse(payload).results[0];
      if (!result) throw new ResearchError("INVALID_RESPONSE", "Tavily extracted no page.");
      return {
        url: result.url,
        title: hostname(result.url) ?? result.url,
        text: normalizedText(result.raw_content),
        retrievedAt: new Date().toISOString(),
        contentType: "text/plain",
      };
    } catch (error) {
      if (!(error instanceof ResearchError || error instanceof z.ZodError)) throw error;
      return fetchPublicPage(url);
    }
  }

  async researchCompany(input: {
    companyName: string;
    websiteUrl: string;
    prospectTitle: string;
    campaignContext: string;
  }): Promise<CompanyResearch> {
    try {
      const websiteHost = hostname(input.websiteUrl) ?? input.websiteUrl;
      const results = await this.searchResults(
        `"${input.companyName}" ${websiteHost} recent hiring expansion operations technology ${input.prospectTitle} ${input.campaignContext.slice(0, 180)}`,
        { maxResults: 8 },
      );
      const research = tavilyResultsToResearch(input.companyName, input.websiteUrl, results);
      if (research.claims.length > 0) return research;
    } catch (error) {
      if (!(error instanceof ResearchError)) throw error;
    }

    try {
      const page = await this.fetchPage(input.websiteUrl);
      return officialWebsiteFallbackResearch(input.companyName, page);
    } catch (error) {
      if (!(error instanceof ResearchError)) throw error;
      return unavailableWebsiteFallbackResearch(input.companyName, input.websiteUrl);
    }
  }
}
