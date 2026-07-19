# Connected email providers

Marlow separates prospecting from email transport. Apollo finds and enriches prospects. Gmail or Microsoft 365 sends the approved email from the user’s connected address.

## Google setup

1. Create a Web application OAuth client in Google Cloud.
2. Enable the Gmail API.
3. Add the production callback URL from `GOOGLE_OAUTH_REDIRECT_URI` as an authorized redirect URI.
4. Configure the OAuth consent screen for the users who can connect.
5. Add the client ID, client secret, and callback URL to Vercel and the worker secret store.

Marlow requests delegated identity, offline access, Gmail send, and basic Gmail settings access. Basic settings access is used only to list verified send-as addresses and retrieve each address’s configured signature. Gmail settings access is a restricted scope, so a public Google app may require OAuth verification and a security assessment. While the app remains in testing, add each intended mailbox owner as a Google OAuth test user.

Marlow sends a deterministic multipart MIME message through `users.messages.send`. The selected verified send-as address is used in the From header. Gmail stores the sent message in the account.

## Microsoft setup

1. Register an application in Microsoft Entra ID.
2. Add a Web platform redirect URI matching `MICROSOFT_OAUTH_REDIRECT_URI`.
3. Add delegated `User.Read` and `Mail.Send` permissions.
4. Allow public or organizational accounts according to the chosen tenant setting.
5. Add the client ID, client secret, callback URL, and tenant to Vercel and the worker secret store.

Marlow uses authorization code flow with PKCE, requests `offline_access`, and calls `POST /me/sendMail`. The From identity is the account that granted access, and Microsoft saves the message in Sent Items.

Microsoft Graph does not expose Outlook’s per-client signature settings. After connecting Microsoft, paste the desired signature into that mailbox’s signature field on the Integrations page. Marlow snapshots it with every draft and includes it in both the review and final send.

## Security and approval

Access and refresh tokens are encrypted at rest. OAuth state is signed, short-lived, bound to the user and organization, and paired with a PKCE verifier. Tokens never enter model prompts or client-side storage.

Changing the draft, sender, signature, or compliance footer invalidates an earlier approval. Immediately before sending, Marlow checks the exact subject, recipient, mailbox, sender, signature, footer, suppression state, campaign state, schedule, and daily limits. An ambiguous provider result is marked delivery unknown and is never retried automatically.
