import { randomBytes } from "node:crypto";
import {
  buildAuthorizationUrl,
  createPkce,
  discoverOAuthMetadata,
  signOAuthState,
} from "@marlow/apollo";
import { encryptSecret } from "@marlow/database";
import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin"]);
    if (isDemoMode()) return apiOk({ status: "CONNECTED", demo: true });
    const clientId = process.env.APOLLO_OAUTH_CLIENT_ID;
    const redirectUri = process.env.APOLLO_OAUTH_REDIRECT_URI;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const signingSecret = process.env.APPROVAL_SIGNING_SECRET;
    if (!clientId || !redirectUri || !encryptionKey || !signingSecret)
      throw new AppError(
        "APOLLO_NOT_CONNECTED",
        "Apollo OAuth is not configured by an administrator.",
        503,
      );
    const metadata = await discoverOAuthMetadata(
      process.env.APOLLO_MCP_URL ?? "https://mcp.apollo.io/mcp",
    );
    const pkce = createPkce();
    const admin = createSupabaseAdminClient();
    const { data: integration, error } = await admin
      .from("integrations")
      .upsert(
        {
          organization_id: auth.organizationId,
          provider: "APOLLO",
          status: "CONNECTING",
          connected_by: auth.userId,
        },
        { onConflict: "organization_id,provider" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const encrypted = encryptSecret(
      JSON.stringify({ verifier: pkce.verifier, metadata }),
      encryptionKey,
    );
    const credential = await admin.from("integration_credentials").upsert(
      {
        organization_id: auth.organizationId,
        integration_id: integration.id,
        encrypted_payload: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      { onConflict: "integration_id" },
    );
    if (credential.error) throw new Error(credential.error.message);
    const state = signOAuthState(
      {
        integrationId: integration.id,
        organizationId: auth.organizationId,
        userId: auth.userId,
        nonce: randomBytes(16).toString("hex"),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      signingSecret,
    );
    const preferredScopes = metadata.scopesSupported.filter((scope) =>
      /search|enrich|contact|list|email|send|account|usage/i.test(scope),
    );
    const authorizationUrl = buildAuthorizationUrl({
      metadata,
      clientId,
      redirectUri,
      state,
      challenge: pkce.challenge,
      scopes: preferredScopes,
    });
    return apiOk({ authorizationUrl });
  } catch (error) {
    return apiError(error);
  }
}
