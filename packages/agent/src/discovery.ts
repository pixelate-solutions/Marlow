import { campaignProfileSchema, type CampaignProfile } from "@marlow/shared";
import { z } from "zod";
import type { ModelMessage, ModelProvider } from "./model";

const discoveryTurnSchema = z.object({
  assistantMessage: z.string().min(1),
  ready: z.boolean(),
  missingRequiredFields: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  profile: campaignProfileSchema.optional(),
});

export type DiscoveryTurn = z.infer<typeof discoveryTurnSchema>;

export class DiscoveryAgent {
  constructor(
    private readonly model: ModelProvider,
    private readonly systemPrompt: string,
  ) {}

  async respond(input: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    researchedCompanyFacts?: string[];
    currentProfile?: Partial<CampaignProfile>;
  }): Promise<DiscoveryTurn> {
    const messages: ModelMessage[] = [
      { role: "system", content: this.systemPrompt },
      {
        role: "system",
        content: `Discovery state (trusted application data): ${JSON.stringify({
          researchedCompanyFacts: input.researchedCompanyFacts ?? [],
          currentProfile: input.currentProfile ?? {},
        })}. Ask exactly one useful question if not ready. Never repeat an answered question. If ready, return a complete validated campaign profile.`,
      },
      ...input.messages,
    ];
    const result = await this.model.generateStructured({
      messages,
      schema: discoveryTurnSchema,
      schemaName: "campaign_discovery_turn",
    });
    if (result.value.ready && !result.value.profile)
      throw new Error("A ready discovery turn must include the complete campaign profile.");
    return result.value;
  }
}
