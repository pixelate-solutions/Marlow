# Connected email providers

Marlow separates prospecting from email transport. Apollo finds and enriches prospects. Gmail or Microsoft 365 sends the approved email from the user’s connected address.

## Google setup

1. Create a Web application OAuth client in Google Cloud.
2. Enable the Gmail API.
3. Add the production callback URL from `GOOGLE_OAUTH_REDIRECT_URI` as an authorized redirect URI.
4. Configure the OAuth consent screen for the users who can connect.
5. Add the client ID, client secret, and callback URL to Vercel and the worker secret store.

Marlow requests delegated identity, offline access, Gmail send, Gmail read-only access, and basic Gmail settings access. Basic settings access is used only to list verified send-as addresses and retrieve each address’s configured signature. Read-only access is used to search for a reply from the recipient after the original send. Marlow stores only the provider message ID and detection time, not the reply body. Gmail read-only and settings access are restricted scopes, so a public Google app may require OAuth verification and a security assessment. While the app remains in testing, add each intended mailbox owner as a Google OAuth test user.

Marlow sends a deterministic multipart MIME message through `users.messages.send`. The selected verified send-as address is used in the From header. Gmail stores the sent message in the account.

## Microsoft setup

1. Register an application in Microsoft Entra ID.
2. Add a Web platform redirect URI matching `MICROSOFT_OAUTH_REDIRECT_URI`.
3. Add delegated `User.Read`, `Mail.Send`, and `Mail.ReadBasic` permissions.
4. Allow public or organizational accounts according to the chosen tenant setting.
5. Add the client ID, client secret, callback URL, and tenant to Vercel and the worker secret store.

Marlow uses authorization code flow with PKCE, requests `offline_access`, and calls `POST /me/sendMail`. The From identity is the account that granted access, and Microsoft saves the message in Sent Items.

`Mail.ReadBasic` lets Marlow check sender and received-time metadata without reading message bodies, previews, attachments, or extended properties. Marlow stores only the provider message ID and detection time when a reply is found.

Microsoft Graph does not expose Outlook’s per-client signature settings. After connecting Microsoft, paste the desired signature into that mailbox’s signature field on the Integrations page. Marlow snapshots it with every draft and includes it in both the review and final send.

## Security and approval

Access and refresh tokens are encrypted at rest. OAuth state is signed, short-lived, bound to the user and organization, and paired with a PKCE verifier. Tokens never enter model prompts or client-side storage.

Changing the draft, sender, signature, or compliance footer invalidates an earlier approval. Immediately before sending, Marlow checks the exact subject, recipient, mailbox, sender, signature, footer, suppression state, campaign state, schedule, and daily limits. An ambiguous provider result is marked delivery unknown and is never retried automatically.

After an initial Gmail or Microsoft email is confirmed sent, Marlow schedules a reply check for seven days later. If no reply is found, it creates one follow-up draft and puts the campaign at the top of the review flow. It never sends that draft automatically. The user must approve it, and Marlow checks for a late reply again immediately before reserving the send. Apollo-only sends are not monitored because Apollo does not grant Marlow inbox access.

Existing Gmail and Microsoft connections must be reconnected once after these permissions are introduced. Reconnection grants the new read-only scope and restores the mailbox to available status.
