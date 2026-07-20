import { readFile } from "node:fs/promises";
import path from "node:path";
import { DiscoveryAgent, MuseSparkProvider, type DiscoveryTurn } from "@marlow/agent";

type DiscoveryMessage = { role: "user" | "assistant"; content: string };

export function discoveryTurnNeedsRecovery(turn: DiscoveryTurn): boolean {
  if (turn.ready) return false;
  return (
    turn.missingRequiredFields.length === 0 ||
    turn.unresolvedQuestions.length === 0 ||
    !turn.assistantMessage.includes("?")
  );
}

export function recoveryDiscoveryTurn(messages: DiscoveryMessage[]): DiscoveryTurn {
  const userContext = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n")
    .toLowerCase()
    .replace(/[\u2012-\u2015]/g, "-");
  const next = [
    {
      answered: /https?:\/\/|\bwww\.|\bwebsite\b/.test(userContext),
      field: "sender.companyWebsite",
      question: "What is your primary company website?",
    },
    {
      answered:
        /\bunited states\b|\bus(?:\b|-wide)|\bu\.s\.(?:\s|$)|\bnationwide\b|\bmidwest\b|\bmichigan\b|\bcanada\b|\beurope\b|\bglobal\b/.test(
          userContext,
        ),
      field: "targetAccount.locations",
      question: "Which geography should this campaign focus on?",
    },
    {
      answered: /\b\d{1,5}\s*(?:-|to|through)\s*\d{1,5}\s+(?:employees|people|staff)\b/.test(
        userContext,
      ),
      field: "targetAccount.employeeRange",
      question: "What employee count range should I use to filter target companies?",
    },
    {
      answered:
        /\bcase stud(?:y|ies)\b|\btestimonial\b|\bclient outcome\b|\bmeasurable result\b|\bproof point\b|\breturn on investment\b/.test(
          userContext,
        ),
      field: "offer.approvedProof",
      question:
        "What proof or client outcomes can I reference truthfully in the outreach? If none are approved yet, say that directly.",
    },
    {
      answered:
        /\bcall to action\b|\bbook (?:a )?(?:call|meeting)\b|\bschedule (?:a )?(?:call|meeting)\b|\b15-minute\b|\bintroductory call\b|\breply to\b/.test(
          userContext,
        ),
      field: "offer.callToAction",
      question: "What single action should the first email ask the recipient to take?",
    },
    {
      answered: /\bdaily (?:send )?(?:cap|limit)\b|\bemails? per day\b|\bpostal address\b/.test(
        userContext,
      ),
      field: "limits.dailySendLimit",
      question: "What daily sending limit should I enforce for this campaign?",
    },
  ].find((item) => !item.answered) ?? {
    field: "disqualifiers",
    question: "Which companies should I exclude even when they match the other filters?",
  };

  return {
    assistantMessage: next.question,
    ready: false,
    missingRequiredFields: [next.field],
    unresolvedQuestions: [next.question],
  };
}

export async function runDiscovery(
  messages: DiscoveryMessage[],
  connectedMailbox?: {
    id: string;
    email: string;
    displayName: string;
    signature: string;
    postalAddress: string;
    senderTitle?: string;
  },
) {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not configured.");
  const promptPath = path.resolve(process.cwd(), "../../packages/agent/prompts/outbound-agent.md");
  const systemPrompt = await readFile(promptPath, "utf8");
  const provider = new MuseSparkProvider({
    apiKey,
    maxRetries: 1,
    timeoutMs: 45_000,
    ...(process.env.META_MODEL_API_BASE_URL
      ? { baseUrl: process.env.META_MODEL_API_BASE_URL }
      : {}),
  });
  return new DiscoveryAgent(provider, systemPrompt).respond({
    messages,
    ...(connectedMailbox ? { connectedMailbox } : {}),
  });
}
