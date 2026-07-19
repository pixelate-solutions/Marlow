# Testing

## Suites

- `packages/shared`: campaign and sending-settings schema validation.
- `packages/agent`: readiness, scoring, deduplication, suppression, compliance, state transitions, tool policy, approval signatures/expiry, final suppression, and concurrent double-click prevention.
- `packages/apollo`: deterministic pagination and provider idempotency.
- `packages/research`: SSRF/private-network protection.
- `packages/database`: credential encryption/decryption and recursive redaction.
- `apps/web`: CSRF and safe-redirect behavior.
- Playwright: desktop and mobile discovery → review → edit → approve/send; repeated idempotency key; CSP/frame headers; cross-site mutation rejection.

Tests assert structured facts and prohibited actions, not exact model prose. Live Muse and Apollo calls are excluded from CI; staging contract checks require credentials and a controlled account.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
```

Database validation:

```bash
supabase start
supabase db reset
supabase db lint --local
supabase stop
```

`supabase db reset` must create 29 public tables, load both migrations, enable RLS on tenant tables, and seed one visibly labeled demo campaign. Never point the local reset command at a hosted production project.

## Adding agent tests

Use `MockModelProvider`, `MockApolloProvider`, and `MockResearchProvider` with synthetic or recorded non-sensitive results. Add schema/decision assertions for missing information, qualification before enrichment, unsupported claims, prompt-injection text, maximum tool calls, and send denial. Do not snapshot chain-of-thought or make assertions on a single exact sentence.

## Live staging contract tests

Run separately from CI with a one-prospect campaign and a dedicated Apollo mailbox. Verify OAuth metadata, advertised MCP tools, pagination cursors, credit accounting, timeout classification, reauthorization, permission denial, a confirmed one-off message ID, and no second message under retry. Clean up Apollo contacts/lists created by the test and retain the audit event.
