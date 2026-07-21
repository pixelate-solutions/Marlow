import { describe, expect, it } from "vitest";
import { companySearchArguments, parseToolPayload, peopleSearchArguments } from "./mcp-provider";
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
});
