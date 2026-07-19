import type { ApolloCompany, ApolloPerson } from "@marlow/apollo";
import type { CampaignProfile, LeadScoreComponents, ResearchClaim } from "@marlow/shared";

function includesLoose(values: string[], candidate?: string): boolean {
  if (!candidate) return false;
  const value = candidate.toLowerCase();
  return values.some(
    (item) => value.includes(item.toLowerCase()) || item.toLowerCase().includes(value),
  );
}

function titleMatches(profile: CampaignProfile, title: string): boolean {
  return profile.targetPersonas.some((persona) => includesLoose(persona.titles, title));
}

export function calculateLeadScore(input: {
  profile: CampaignProfile;
  company: ApolloCompany;
  person: ApolloPerson;
  claims: ResearchClaim[];
  hasBuyingSignal: boolean;
  painPointSupported: boolean;
  disqualified?: boolean;
}): { total: number; components: LeadScoreComponents; explanation: string } {
  const { profile, company, person } = input;
  const range = profile.targetAccount.employeeRange;
  const sizeMatch =
    !range || company.employeeCount === undefined
      ? 5
      : (range.min === undefined || company.employeeCount >= range.min) &&
          (range.max === undefined || company.employeeCount <= range.max)
        ? 10
        : 0;
  const confidencePoints =
    input.claims.length === 0
      ? 0
      : Math.min(
          8,
          Math.round(
            (input.claims.reduce(
              (sum, claim) =>
                sum +
                (claim.confidence === "high" ? 1 : claim.confidence === "medium" ? 0.65 : 0.3),
              0,
            ) /
              input.claims.length) *
              8,
          ),
        );
  const components: LeadScoreComponents = {
    industryMatch: includesLoose(profile.targetAccount.industries, company.industry) ? 15 : 0,
    companySizeMatch: sizeMatch,
    geographyMatch:
      profile.targetAccount.locations.length === 0 ||
      includesLoose(profile.targetAccount.locations, company.location)
        ? 5
        : 0,
    personaMatch: titleMatches(profile, person.title) ? 15 : 4,
    seniorityMatch: profile.targetPersonas.some((persona) =>
      persona.seniorities.some((level) => person.title.toLowerCase().includes(level.toLowerCase())),
    )
      ? 10
      : 5,
    technologyMatch:
      profile.targetAccount.technologies.length === 0
        ? 4
        : company.technologies.some((technology) =>
              includesLoose(profile.targetAccount.technologies, technology),
            )
          ? 8
          : 0,
    painPointRelevance: input.painPointSupported ? 12 : 4,
    buyingSignal: input.hasBuyingSignal ? 10 : 0,
    researchConfidence: confidencePoints,
    contactability: person.emailStatus === "verified" ? 7 : person.email ? 3 : 0,
    disqualifierPenalty: input.disqualified ? -100 : 0,
  };
  const total = Math.max(
    0,
    Math.min(
      100,
      Object.values(components).reduce((sum, value) => sum + value, 0),
    ),
  );
  const strongest = Object.entries(components)
    .filter((entry) => entry[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase());
  return {
    total,
    components,
    explanation: `Score ${total}/100. Strongest signals: ${strongest.join(", ") || "none"}.`,
  };
}
