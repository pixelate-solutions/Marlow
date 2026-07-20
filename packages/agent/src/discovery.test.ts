import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { DiscoveryAgent } from "./discovery";
import type { ModelMessage, ModelProvider, StructuredModelResult } from "./model";

class CapturingProvider implements ModelProvider {
  readonly provider = "mock" as const;
  readonly modelId = "mock-muse-spark-1.1" as const;
  messages: ModelMessage[] = [];

  async generateStructured<T>(input: {
    messages: ModelMessage[];
    schema: ZodType<T>;
    schemaName: string;
    temperature?: number;
  }): Promise<StructuredModelResult<T>> {
    this.messages = input.messages;
    return {
      value: input.schema.parse({
        assistantMessage: "What proof can I reference?",
        ready: false,
        missingRequiredFields: ["offer.approvedProof"],
        unresolvedQuestions: ["What proof can I reference?"],
      }),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

describe("DiscoveryAgent", () => {
  it("tells the model not to generate a partial profile during discovery", async () => {
    const provider = new CapturingProvider();
    const agent = new DiscoveryAgent(provider, "Campaign discovery system prompt");

    const result = await agent.respond({
      messages: [{ role: "user", content: "We sell workflow software." }],
    });

    expect(result.ready).toBe(false);
    expect(result.profile).toBeUndefined();
    expect(provider.messages[1]?.content).toContain(
      "When ready is false, set profile to null instead of generating a partial profile",
    );
    expect(provider.messages[1]?.content).toContain("No background work continues after your response.");
  });
});
