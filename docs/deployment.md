# Deployment

The production topology has three independently managed planes:

- Vercel: `apps/web`, authenticated APIs, and resumable event streams.
- Railway: one continuously running `apps/agent-worker` service.
- Supabase: Auth and PostgreSQL/RLS.

Never run long campaign workflows inside a Vercel request.

## Supabase

1. Create a hosted project and set the production Site URL and `/auth/callback` redirect.
2. Apply all ordered files in `supabase/migrations/` with `supabase db push --linked`. The third migration grants least-privilege API access while keeping credential, job, approval, send, and rate-limit tables server-only.
3. Verify every tenant table reports RLS enabled and test two real users in different organizations.
4. Do not apply `supabase/seed.sql` to production. It is deterministic review data only.
5. Copy the project URL, publishable key, and secret key into the web and worker secret stores as appropriate. Marlow still accepts the legacy anon/service-role names during migration, but new deployments should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
6. `SUPABASE_JWKS_URL` is optional because the Supabase SDK validates Marlow sessions through the Auth service. Keep it available only for a future service that verifies JWTs directly.

## Vercel web

Import the repository as a monorepo using the repository root. `vercel.json` installs the frozen pnpm lockfile and builds the `@marlow/web` dependency graph. Set the Supabase URL, publishable key, secret key, model key, encryption key, approval signing secret, and relevant search/guardrail variables. Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin and register the same origin with Supabase and Apollo. Apollo, Google, and Microsoft OAuth client values are feature-level configuration: the site can start without them, but users cannot connect the corresponding provider until they are present.

For the current production origin, register these exact delegated-mail callbacks:

```text
https://marlow-ashy.vercel.app/api/integrations/email/google/callback
https://marlow-ashy.vercel.app/api/integrations/email/microsoft/callback
```

Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` in Vercel. Set `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_REDIRECT_URI`, and `MICROSOFT_OAUTH_TENANT` there too. Use `common` for the Microsoft tenant when both personal Microsoft accounts and work accounts should be allowed. Copy the client IDs and secrets to the worker environment if background email send jobs are enabled.

Run a staging build before production:

```bash
pnpm turbo build --filter=@marlow/web
```

## Railway worker

The worker imports shared workspace packages, so keep the repository root as the build context; do not set `source.rootDirectory` to `apps/agent-worker`. Configure the shared-monorepo commands:

```bash
railway environment edit --service-config marlow-worker build.buildCommand "pnpm install --frozen-lockfile && pnpm --filter @marlow/agent-worker... build"
railway environment edit --service-config marlow-worker deploy.startCommand "pnpm --filter @marlow/agent-worker start"
railway environment edit --service-config marlow-worker deploy.restartPolicyType ALWAYS
railway environment edit --service-config marlow-worker build.watchPatterns '["apps/agent-worker/**","packages/agent/**","packages/apollo/**","packages/research/**","packages/database/**","packages/shared/**","packages/config/**","pnpm-lock.yaml"]'
```

Set worker secrets with Railway variables. Use stdin for sensitive values rather than including them in shell history. The worker needs the Supabase secret key, project URL, model key, encryption key, Apollo MCP configuration, search configuration, concurrency and guardrail values. It does not need the browser publishable key. A direct database URL is needed for database CLI workflows, not for the current worker runtime.

Deploy from the repository root with an auditable release message:

```bash
railway up --service marlow-worker --environment production --detach -m "Deploy durable Marlow agent worker"
railway deployment list --service marlow-worker --environment production --json
```

A detached upload only means the build is queued. Keep polling the newest deployment and report success only after its terminal status is `SUCCESS`; use bounded build/runtime logs for `FAILED` or `CRASHED` states. Configure at least one replica and do not enable application sleeping. The PostgreSQL job claim uses `SKIP LOCKED`, so multiple replicas can share work safely within `WORKER_CONCURRENCY` limits.

## Staging campaign checklist

1. Confirm production validation rejects missing secrets and mock adapters.
2. Sign in as a staging user and verify organization creation/RLS.
3. Connect a sandbox Apollo account for prospecting and connect a Gmail or Microsoft mailbox for sending.
4. Use a low credit budget, one prospect, and a daily send cap of one.
5. Complete discovery and verify the structured profile, sources, score, and draft.
6. Edit the draft and confirm any earlier approval is invalid.
7. Suppress the recipient and confirm send is blocked; revoke the suppression only for the controlled test.
8. Approve once and confirm the provider message reference, exact sender and content audit hashes, and a single send row.
9. Confirm the message appears in the connected account’s Sent folder with the snapshotted signature and compliance footer.
10. Disconnect each provider from Integrations and confirm encrypted credentials are removed.

## Health and rollback

Monitor worker heartbeats, queued/failed jobs, model/MCP error rates, credit usage, pending approvals, ambiguous deliveries, and search-to-draft time. Web rollback uses the previous Vercel deployment. Worker rollback uses the previous Railway deployment; schema changes are forward-only unless a reviewed compensating migration is prepared.
