import { describe, expect, it } from "vitest";
import {
  companySearchArguments,
  mapCompanyPayload,
  mapPersonPayload,
  parseToolPayload,
  peopleSearchArguments,
} from "./mcp-provider";
import { ApolloError } from "./types";

describe("Apollo MCP argument mapping", () => {
  it("maps a campaign account search to Apollo's current company search schema", () => {
    expect(
      companySearchArguments({
        industries: ["Manufacturing"],
        employeeRanges: [{ min: 20, max: 200 }],
        revenueRanges: [{ min: 1_000_000, max: 50_000_000, currency: "USD" }],
        locations: ["United States"],
        technologies: ["Microsoft Dynamics 365"],
        keywords: ["workflow automation"],
        exclusions: [],
        cursor: "2",
        pageSize: 50,
      }),
    ).toMatchObject({
      q_organization_keyword_tags: ["Manufacturing", "workflow automation"],
      organization_locations: ["United States"],
      organization_num_employees_ranges: ["20,200"],
      currently_using_any_of_technology_uids: ["microsoft_dynamics_365"],
      revenue_range: { min: 1_000_000, max: 50_000_000 },
      per_page: 50,
      page: 2,
    });
  });

  it("maps a prospect search to Apollo's current people search schema", () => {
    expect(
      peopleSearchArguments({
        companyIds: ["company-1"],
        jobFunctions: ["Operations"],
        titles: ["VP of Operations"],
        seniorities: ["C-Suite", "VP"],
        locations: ["United States"],
        pageSize: 25,
      }),
    ).toMatchObject({
      organization_ids: ["company-1"],
      q_keywords: "Operations",
      person_titles: ["VP of Operations"],
      include_similar_titles: true,
      person_seniorities: ["c_suite", "vp"],
      person_locations: ["United States"],
      per_page: 25,
      page: 1,
    });
  });

  it("reports Apollo's paid-plan requirement as a non-retryable error", () => {
    expect.assertions(3);
    try {
      parseToolPayload({
        content: [],
        structuredContent: {
          error: "This API is not included in your Free plan. Upgrade your plan to use search.",
          error_code: "API_INACCESSIBLE",
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApolloError);
      expect((error as ApolloError).code).toBe("APOLLO_PLAN_UPGRADE_REQUIRED");
      expect((error as ApolloError).retryable).toBe(false);
    }
  });

  it("treats Apollo rate limits as retryable instead of exhausted credits", () => {
    expect.assertions(3);
    try {
      parseToolPayload({
        isError: true,
        content: [{ type: "text", text: "Rate limit exceeded" }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApolloError);
      expect((error as ApolloError).code).toBe("APOLLO_RATE_LIMITED");
      expect((error as ApolloError).retryable).toBe(true);
    }
  });

  it("skips incomplete companies and derives domains from valid websites", () => {
    expect(mapCompanyPayload({ id: "company-1", name: "Incomplete" })).toBeUndefined();
    expect(
      mapCompanyPayload({
        id: "company-2",
        name: "Valid",
        website_url: "https://www.valid.example/about",
        organization_revenue: 5_000_000,
        city: "Detroit",
        state: "Michigan",
        country: "United States",
      }),
    ).toMatchObject({
      id: "company-2",
      domain: "valid.example",
      estimatedRevenue: 5_000_000,
      location: "Detroit, Michigan, United States",
    });
  });

  it("uses Apollo's obfuscated search surname and the requested company ID", () => {
    expect(
      mapPersonPayload(
        {
          id: "person-1",
          first_name: "Morgan",
          last_name_obfuscated: "R***",
          title: "VP of Operations",
        },
        "company-1",
      ),
    ).toMatchObject({
      personId: "person-1",
      companyId: "company-1",
      firstName: "Morgan",
      lastName: "R***",
      title: "VP of Operations",
    });
  });
});
