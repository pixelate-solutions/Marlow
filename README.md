# Marlow

Marlow is an AI-powered lead-generation and cold-outreach platform. A user describes a company, offer, and market in conversation; Muse Spark 1.1 builds a structured campaign profile, Apollo’s official remote MCP finds and enriches prospects, public research supplies cited evidence, and Marlow prepares concise emails for human review.

Collaborative mode is mandatory. The model cannot call the send tool. A direct **Approve and send** action creates a short-lived, exact-draft approval and the application rechecks tenancy, hashes, recipient, mailbox, suppression, campaign state, and limits before Apollo is invoked.

## Architecture

This is a pnpm/Turborepo TypeScript monorepo:

```text
apps/
  web/             Next.js control plane, authenticated APIs, SSE, review UI
  agent-worker/    persistent PostgreSQL job worker
packages/
  agent/           Muse Spark provider, discovery, workflow, policy, approval
  apollo/          typed Apollo remote-MCP adapter and OAuth/PKCE
  research/        grounded search and SSRF-safe public retrieval
  database/        Supabase repository, credential encryption, job claims
  shared/          Zod contracts, statuses, errors, product constants
  ui/              accessible UI primitives
  config/          runtime environment validation
supabase/
  migrations/      normalized schema, RLS, RPCs, triggers, indexes
  seed.sql         visibly labeled deterministic demo data
```

The browser talks only to authenticated application APIs. Long prospecting runs execute in `apps/agent-worker`; the web process enqueues PostgreSQL jobs and streams public progress events. See [architecture](docs/architecture.md) and [agent design](docs/agent-design.md).

## Local development

Requirements: Node.js 20.9+, pnpm 10+, Docker, and Supabase CLI 2.x.

```bash
pnpm install
cp .env.example apps/web/.env.local
supabase start
supabase status
pnpm --filter @marlow/web dev
```

Copy the local API URL, anon key, service-role key, and database URL from `supabase status` into `apps/web/.env.local`. The local ports are `55431`–`55437` to avoid common collisions. Run the durable worker in a second terminal with the same values exported:

```bash
set -a
source apps/web/.env.local
set +a
pnpm --filter @marlow/agent-worker dev
```

For a deterministic UI walkthrough with no credentials or external side effects:

```bash
DEMO_MODE=true MOCK_INTEGRATIONS=true pnpm --filter @marlow/web dev
```

Demo data is labeled, uses `.example` domains, consumes no Apollo credits, and sends no external email. Mock adapters are explicit and the production environment validator rejects `MOCK_INTEGRATIONS=true`.

## Production integrations

- **Model:** set `MODEL_API_KEY`; production is locked to `https://api.meta.ai/v1` and `muse-spark-1.1`. Errors are retried only when transient. There is no fallback model.
- **Apollo:** register the callback in `APOLLO_OAUTH_REDIRECT_URI`, then set the Apollo OAuth client values. The app discovers OAuth metadata, uses PKCE and signed state, encrypts tokens with AES-256-GCM, and connects only to `https://mcp.apollo.io/mcp`. `APOLLO_API_KEY` is a REST credential and cannot replace MCP OAuth.
- **Supabase:** apply all migrations, verify RLS, configure Auth redirect URLs, use the current publishable/secret keys, and keep `SUPABASE_SECRET_KEY` server-only. Legacy anon/service-role environment names remain supported during migration.
- **Research:** production uses Meta search grounding plus safe public-page retrieval. Retrieved content remains untrusted model data.

External setup details are in [Apollo MCP](docs/apollo-mcp.md), [deployment](docs/deployment.md), and [security](docs/security.md).

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
supabase db reset
```

The browser suite covers desktop and mobile discovery, review, edit, approval, exact-once demo sending, CSP headers, and CSRF rejection. The unit and integration suites avoid exact wording assertions; they test schemas, facts, tool decisions, and prohibited behavior. See [testing](docs/testing.md).

## Deployment split

- Deploy `apps/web` as a Next.js application on Vercel.
- Deploy `apps/agent-worker` as a continuously running service on Railway or another container host.
- Use Supabase for Auth and PostgreSQL; do not run the worker inside a Vercel request.

No live deploy is attempted by this repository. Credentials, an Apollo partner/OAuth client, a Meta Model API key, and hosted Supabase project are required before a staging campaign can make real calls.
