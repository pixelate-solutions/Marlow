import { readFile } from "node:fs/promises";
import path from "node:path";
import { DiscoveryAgent, MuseSparkProvider } from "@marlow/agent";

export async function runDiscovery(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
) {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not configured.");
  const promptPath = path.resolve(process.cwd(), "../../packages/agent/prompts/outbound-agent.md");
  const systemPrompt = await readFile(promptPath, "utf8");
  const provider = new MuseSparkProvider({
    apiKey,
    ...(process.env.META_MODEL_API_BASE_URL
      ? { baseUrl: process.env.META_MODEL_API_BASE_URL }
      : {}),
  });
  return new DiscoveryAgent(provider, systemPrompt).respond({ messages });
}
