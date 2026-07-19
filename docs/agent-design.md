# Agent design

The version-controlled system prompt is [`packages/agent/prompts/outbound-agent.md`](../packages/agent/prompts/outbound-agent.md). Both writing and independent quality review use Muse Spark 1.1.

## Controlled loop

The worker follows `perceive → decide → authorize → call → validate → persist → reassess`. Model outputs are parsed by Zod before use. A `ToolPolicyRegistry` attaches these properties to every tool:

```ts
type ToolPolicy = {
  readOnly: boolean;
  creditConsuming: boolean;
  externalSideEffect: boolean;
  sendCapable: boolean;
  requiresApproval: boolean;
};
```

The registry denies unknown tools, paused-campaign mutations, enrichment without budget, and every model or worker attempt to use a send-capable tool. Only the application approval gate can receive the `approval-gate` actor capability.

## Discovery

The discovery role asks one question at a time, uses researched company facts, avoids repeated questions, and returns missing fields plus a readiness score. A ready turn must contain the complete `CampaignProfile`; incomplete output cannot mark a campaign ready.

## Prospecting

Muse creates a structured search plan. The worker paginates account and people searches, applies coarse deterministic qualification, checks suppression and deduplication, then spends enrichment credits only when required. Each stored credit event records expected/actual usage, tool, reason, and budget remaining.

Public research favors official company pages, careers, press releases, Apollo data, and reputable news. Every material claim needs a URL and retrieval time; snippets are never treated as confirmation. Website text is explicitly wrapped as untrusted data and cannot instruct the agent or receive credentials.

## Scoring and writing

The score is a bounded sum of industry, size, geography, persona, seniority, technology, pain relevance, buying signal, research confidence, contactability, and disqualifier penalty. Components and an explanation are persisted.

Writing receives only selected campaign fields, prospect fields, and verified claims. Citations are stored for the review UI and excluded from email text. Deterministic compliance runs before a separate Muse quality review. Missing evidence, low scores, or a failed review cause a skip rather than fabricated personalization.

## Failure behavior

Transient Muse and MCP failures use bounded backoff. Provider failure is surfaced with a typed error; no other model or Apollo browser automation is used. Runs stop at configured wall-clock, tool-call, prospect, pause, or credit limits. Public progress events are concise summaries and never chain-of-thought.
