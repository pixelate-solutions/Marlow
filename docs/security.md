# Security model

## Tenant isolation and authorization

Every tenant-owned table carries `organization_id`, has RLS enabled and forced, and uses membership helper functions. Browser clients have no policy for `integration_credentials`, `agent_jobs`, `approvals`, `email_sends`, or `rate_limits`; server-only operations use the service role. API routes still check membership and role before querying so authorization is layered rather than delegated only to RLS.

Supabase Auth sessions use secure HTTP-only cookies through `@supabase/ssr`. Write routes require a matching `Origin` and reject cross-site `Sec-Fetch-Site` values. Organization-scoped PostgreSQL rate limits protect expensive and send-capable operations.

## Approval and duplicate-send prevention

The direct user click creates an approval containing organization, user, prospect, draft, exact recipient, exact mailbox, SHA-256 subject/body hashes, timestamps, and a one-time random nonce hash. The PostgreSQL function locks the draft, checks membership, status, suppression and daily limits, creates the approval and unique send reservation, consumes the nonce, and writes an immutable audit event in one transaction.

Immediately before Apollo, the application reloads everything and checks the same hashes and identities again. Draft edits increment a revision, invalidate unconsumed approvals, and return the draft to pending review. Unique `(organization_id, idempotency_key)` and `approval_id` constraints prevent double clicks, request retries, and concurrent claims from creating another send.

## Secrets and OAuth

- Apollo payloads use AES-256-GCM with a random IV and authentication tag.
- `ENCRYPTION_KEY`, service-role keys, approval secrets, OAuth client secrets, and model keys are server-only.
- OAuth state is signed, short-lived, user/organization bound, and coupled to PKCE.
- Logs recursively redact token, cookie, authorization, password, secret, key, and credential fields.
- Credentials are not sent to the model, search queries, browser storage, or client bundles.

Rotate secrets by creating a new key version, decrypting/re-encrypting credentials with an offline/server migration, switching `ENCRYPTION_KEY`, and then retiring the old key. Rotating `APPROVAL_SIGNING_SECRET` invalidates outstanding OAuth state and signed approvals; do it during a quiet window. Rotate Supabase, Meta, and Apollo keys at their providers and update server variables atomically.

## Web and model safety

Public fetches allow only HTTP(S), resolve DNS before the request, block loopback/private/link-local addresses and credentials in URLs, reject redirects, restrict content types, cap pages at 1 MB, and time out. Browser tooling is limited to public pages and may not bypass CAPTCHAs, access controls, robots, or authenticated services.

Retrieved content is untrusted data. System instructions tell Muse to ignore embedded instructions; tools expose only required fields; the policy layer decides tool permission. Hidden reasoning, prompts, cookies, and tokens never appear in public progress events.

Security headers include CSP, frame denial, MIME sniff prevention, restrictive referrer and permissions policies, and same-origin opener policy. Production should migrate CSP to per-request nonces if third-party scripts are added; do not weaken it with broad external script hosts.

## Audit and incident response

Audit events record campaign initiation, integration changes, search/tool metadata, credit use, research sources, draft revisions, approval identity/hashes, exact sent content, mailbox, Apollo message ID, and timestamps. Audit history uses soft deletion where evidence must remain.

For an ambiguous delivery: pause the campaign, inspect the `email_sends` row and Apollo message history, never blindly replay the job, then reconcile the status with an administrative audit note.
