# Apollo remote MCP

Marlow integrates only through Apollo’s official remote MCP endpoint (`https://mcp.apollo.io/mcp`). It does not automate Apollo’s web interface.

## OAuth lifecycle

1. `POST /api/integrations/apollo/connect` validates an owner/admin session and same-origin request.
2. The server discovers RFC 9728 protected-resource and authorization-server metadata.
3. It generates PKCE, stores the verifier encrypted, signs a short-lived state containing organization/user/integration IDs, and returns the authorization URL.
4. The callback validates the signature, expiration, logged-in user, and organization before exchanging the code.
5. Access and refresh tokens are encrypted with AES-256-GCM in `integration_credentials`; that table has RLS enabled and no browser policy.
6. Disconnect attempts remote token revocation, always removes local ciphertext, marks the integration disconnected, and audits the action.

Register this exact callback with Apollo:

```text
https://YOUR_APP/api/integrations/apollo/callback
```

Set the URL in `APOLLO_OAUTH_REDIRECT_URI`. Never place the client secret or tokens in `NEXT_PUBLIC_*` variables.

## Typed adapter

`ApolloProvider` covers mailbox listing, account/people search, company/person enrichment, contact lookup/creation, list management, one-off sending, usage, pagination, and disconnect. `ApolloMcpProvider` maps logical operations to advertised MCP tool names so the rest of Marlow does not depend on Apollo tool naming.

MCP results are reduced to selected typed fields before they enter prompts. Credentials, cookies, and raw unnecessary personal data are redacted from tool logs.

## Credits and errors

Account/person searches run before enrichment. The worker checks deterministic suppression and coarse qualification first, records actual credit use, and stops credit-consuming calls at the campaign budget. Errors are classified as reauthorization, credit limit, permission, rate limit, unavailable tool, invalid response, or transient unavailability.

Apollo disconnection or reauthorization requirements pause affected work; Marlow does not switch to browser automation.

## Sending

The adapter accepts an application idempotency key and passes it to the Apollo one-off email tool. The application reserves a unique send in PostgreSQL, then revalidates the current draft hashes, recipient, mailbox, campaign, suppression state, role, approval expiry, and limits. It marks `SENT` only after Apollo supplies an external message identifier.

If a network timeout makes delivery ambiguous, the row becomes `DELIVERY_UNKNOWN`. Marlow does not automatically retry an ambiguous send. An administrator must reconcile it against Apollo before any manual action.
