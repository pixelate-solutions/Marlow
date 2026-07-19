import { randomBytes } from "node:crypto";
import { buildAuthorizationUrl, createPkce, signOAuthState } from "@marlow/email";
import { encryptSecret } from "@marlow/database";
import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { mailboxOAuthConfig, providerFromSlug } from "@/lib/mailboxes";
import { assertCsrf } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin"]);
    const { provider: slug } = await params;
    const provider = providerFromSlug(slug);
    if (!provider) throw new AppError("NOT_FOUND", "Email provider was not found.", 404);
    if (isDemoMode()) return apiOk({ status: "CONNECTED", demo: true });
    const config = mailboxOAuthConfig(provider);
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const signingSecret = process.env.APPROVAL_SIGNING_SECRET;
    if (
      !config.clientId ||
      !config.clientSecret ||
      !config.redirectUri ||
      !encryptionKey ||
      !signingSecret
    )
      throw new AppError(
        "MAILBOX_NOT_CONNECTED",
        `${provider === "GMAIL" ? "Google" : "Microsoft"} OAuth is not configured by an administrator.`,
        503,
      );
    const pkce = createPkce();
    const admin = createSupabaseAdminClient();
    const { data: integration, error } = await admin
      .from("integrations")
      .upsert(
        {
          organization_id: auth.organizationId,
          provider,
          status: "CONNECTING",
          connected_by: auth.userId,
        },
        { onConflict: "organization_id,provider" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const encrypted = encryptSecret(
      JSON.stringify({ verifier: pkce.verifier, provider }),
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
        provider,
        nonce: randomBytes(16).toString("hex"),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      signingSecret,
    );
    return apiOk({
      authorizationUrl: buildAuthorizationUrl({
        provider,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
        challenge: pkce.challenge,
        tenant: config.tenant,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
