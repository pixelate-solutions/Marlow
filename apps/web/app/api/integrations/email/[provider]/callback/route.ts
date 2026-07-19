import { exchangeAuthorizationCode, verifyOAuthState } from "@marlow/email";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@marlow/database";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  mailboxOAuthConfig,
  providerFromSlug,
  providerSlug,
  syncProviderMailboxes,
} from "@/lib/mailboxes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const url = new URL(request.url);
  const destination = new URL("/integrations", url);
  try {
    const { provider: slug } = await params;
    const provider = providerFromSlug(slug);
    if (!provider) throw new Error("Email provider was not found.");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) throw new Error("Mailbox authorization was denied.");
    if (!code || !state) throw new Error("Mailbox callback omitted required parameters.");
    const signingSecret = process.env.APPROVAL_SIGNING_SECRET;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const config = mailboxOAuthConfig(provider);
    if (
      !signingSecret ||
      !encryptionKey ||
      !config.clientId ||
      !config.clientSecret ||
      !config.redirectUri
    )
      throw new Error("Mailbox OAuth is not configured.");
    const stateData = verifyOAuthState(state, signingSecret);
    if (stateData.provider !== provider) throw new Error("Mailbox OAuth provider mismatch.");
    const integrationId = stateData.integrationId;
    if (!integrationId) throw new Error("Mailbox OAuth integration is missing.");
    if (!stateData.expiresAt || new Date(stateData.expiresAt) <= new Date())
      throw new Error("Mailbox OAuth state expired.");
    const auth = await getAuthContext();
    if (
      !auth ||
      auth.userId !== stateData.userId ||
      auth.organizationId !== stateData.organizationId
    )
      throw new Error("Mailbox OAuth session does not match the initiating user.");
    const admin = createSupabaseAdminClient();
    const { data: credential, error: credentialError } = await admin
      .from("integration_credentials")
      .select("encrypted_payload,iv,auth_tag,key_version")
      .eq("integration_id", integrationId)
      .eq("organization_id", auth.organizationId)
      .single();
    if (credentialError) throw new Error(credentialError.message);
    const encrypted: EncryptedSecret = {
      ciphertext: credential.encrypted_payload,
      iv: credential.iv,
      authTag: credential.auth_tag,
      keyVersion: credential.key_version,
    };
    const temporary = JSON.parse(decryptSecret(encrypted, encryptionKey)) as {
      verifier?: string;
      provider?: string;
    };
    if (!temporary.verifier || temporary.provider !== provider)
      throw new Error("Mailbox OAuth verifier is unavailable.");
    const tokens = await exchangeAuthorizationCode({
      provider,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      code,
      verifier: temporary.verifier,
      tenant: config.tenant,
    });
    const stored = encryptSecret(JSON.stringify({ ...tokens, provider }), encryptionKey);
    const credentialUpdate = await admin
      .from("integration_credentials")
      .update({
        encrypted_payload: stored.ciphertext,
        iv: stored.iv,
        auth_tag: stored.authTag,
        key_version: stored.keyVersion,
        expires_at: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1_000).toISOString()
          : null,
      })
      .eq("integration_id", integrationId);
    if (credentialUpdate.error) throw new Error(credentialUpdate.error.message);
    const integrationUpdate = await admin
      .from("integrations")
      .update({
        status: "CONNECTED",
        scopes: tokens.scope?.split(" ") ?? [],
        connected_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", integrationId);
    if (integrationUpdate.error) throw new Error(integrationUpdate.error.message);
    const mailboxes = await syncProviderMailboxes({
      organizationId: auth.organizationId,
      integrationId,
      provider,
    });
    const connected = mailboxes.find((mailbox) => mailbox.provider === provider);
    await admin
      .from("integrations")
      .update({
        external_account_id: connected?.email ?? null,
        display_name: connected?.displayName ?? connected?.email ?? null,
      })
      .eq("id", integrationId);
    await admin.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: `${provider}_CONNECTED`,
      entity_type: "integration",
      entity_id: integrationId,
      immutable_data: {
        scopes: tokens.scope?.split(" ") ?? [],
        mailboxes: mailboxes
          .filter((mailbox) => mailbox.provider === provider)
          .map((mailbox) => mailbox.email),
      },
    });
    destination.searchParams.set("connected", providerSlug(provider));
  } catch (error) {
    destination.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Mailbox connection failed.",
    );
  }
  return NextResponse.redirect(destination, 303);
}
