import { decryptSecret, encryptSecret, type EncryptedSecret } from "@marlow/database";
import { exchangeAuthorizationCode, verifyOAuthState, type OAuthMetadata } from "@marlow/apollo";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const destination = new URL("/integrations", url);
  try {
    if (error) throw new Error("Apollo authorization was denied.");
    if (!code || !state) throw new Error("Apollo callback omitted required parameters.");
    const signingSecret = process.env.APPROVAL_SIGNING_SECRET;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const clientId = process.env.APOLLO_OAUTH_CLIENT_ID;
    const clientSecret = process.env.APOLLO_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.APOLLO_OAUTH_REDIRECT_URI;
    if (!signingSecret || !encryptionKey || !clientId || !clientSecret || !redirectUri)
      throw new Error("Apollo OAuth is not configured.");
    const stateData = verifyOAuthState(state, signingSecret);
    if (!stateData.expiresAt || new Date(stateData.expiresAt) <= new Date())
      throw new Error("Apollo OAuth state expired.");
    const auth = await getAuthContext();
    if (
      !auth ||
      auth.userId !== stateData.userId ||
      auth.organizationId !== stateData.organizationId
    )
      throw new Error("Apollo OAuth session does not match the initiating user.");
    const admin = createSupabaseAdminClient();
    const { data: credential, error: credentialError } = await admin
      .from("integration_credentials")
      .select("encrypted_payload,iv,auth_tag,key_version")
      .eq("integration_id", stateData.integrationId)
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
      verifier: string;
      metadata: OAuthMetadata;
    };
    const tokens = await exchangeAuthorizationCode({
      metadata: temporary.metadata,
      clientId,
      clientSecret,
      redirectUri,
      code,
      verifier: temporary.verifier,
    });
    const stored = encryptSecret(
      JSON.stringify({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenEndpoint: temporary.metadata.tokenEndpoint,
        revocationEndpoint: temporary.metadata.revocationEndpoint,
      }),
      encryptionKey,
    );
    const updateCredential = await admin
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
      .eq("integration_id", stateData.integrationId);
    if (updateCredential.error) throw new Error(updateCredential.error.message);
    await admin
      .from("integrations")
      .update({
        status: "CONNECTED",
        scopes: tokens.scope?.split(" ") ?? [],
        connected_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", stateData.integrationId);
    await admin.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "APOLLO_CONNECTED",
      entity_type: "integration",
      entity_id: stateData.integrationId,
      immutable_data: { scopes: tokens.scope?.split(" ") ?? [] },
    });
    destination.searchParams.set("connected", "apollo");
  } catch (callbackError) {
    destination.searchParams.set(
      "error",
      callbackError instanceof Error ? callbackError.message : "Apollo connection failed.",
    );
  }
  return NextResponse.redirect(destination, 303);
}
