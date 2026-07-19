import { describe, expect, it } from "vitest";
import { DiscoveryAgent } from "./discovery";
import { MuseSparkProvider } from "./model";

const liveModelTest = process.env.RUN_LIVE_MODEL_TEST === "1" ? it : it.skip;

describe("Muse Spark structured output", () => {
  liveModelTest(
    "accepts optional fields through the strict provider schema",
    async () => {
      const apiKey = process.env.MODEL_API_KEY;
      if (!apiKey) throw new Error("MODEL_API_KEY is required for the live model test.");
      const provider = new MuseSparkProvider({
        apiKey,
        ...(process.env.META_MODEL_API_BASE_URL
          ? { baseUrl: process.env.META_MODEL_API_BASE_URL }
          : {}),
        maxRetries: 0,
      });
      const agent = new DiscoveryAgent(
        provider,
        "Continue campaign discovery. Ask exactly one question. The campaign is not ready yet, so return no profile.",
      );
      const result = await agent.respond({
        messages: [
          {
            role: "user",
            content:
              "We build custom software and AI tools for operationally complex small and mid-sized businesses.",
          },
          {
            role: "assistant",
            content: "Who feels the problem directly, and who owns the buying decision?",
          },
          {
            role: "user",
            content:
              "Operations leaders and administrators feel it. Presidents, COOs, and operations executives approve the purchase.",
          },
        ],
      });

      expect(result.ready).toBe(false);
      expect(result.profile).toBeUndefined();
      expect(result.assistantMessage.length).toBeGreaterThan(0);
    },
    90_000,
  );
});
