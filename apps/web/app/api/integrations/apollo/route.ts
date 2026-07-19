import { decryptSecret, type EncryptedSecret } from "@marlow/database";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin"]);
    if (isDemoMode()) return apiOk({ status: "DISCONNECTED", demo: true });
    const admin = createSupabaseAdminClient();
    const { data: integration } = await admin
      .from("integrations")
      .select("id,integration_credentials(encrypted_payload,iv,auth_tag,key_version)")
      .eq("organization_id", auth.organizationId)
      .eq("provider", "APOLLO")
      .maybeSingle();
    if (integration && process.env.ENCRYPTION_KEY) {
      const raw = Array.isArray(integration.integration_credentials)
        ? integration.integration_credentials[0]
        : integration.integration_credentials;
      if (raw) {
        try {
          const secret: EncryptedSecret = {
            ciphertext: raw.encrypted_payload,
            iv: raw.iv,
            authTag: raw.auth_tag,
            keyVersion: raw.key_version,
          };
          const tokens = JSON.parse(decryptSecret(secret, process.env.ENCRYPTION_KEY)) as {
            accessToken?: string;
            revocationEndpoint?: string;
          };
          if (tokens.revocationEndpoint && tokens.accessToken)
            await fetch(tokens.revocationEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                token: tokens.accessToken,
                client_id: process.env.APOLLO_OAUTH_CLIENT_ID ?? "",
                client_secret: process.env.APOLLO_OAUTH_CLIENT_SECRET ?? "",
              }),
            });
        } catch {
          /* Local revocation proceeds even if the remote endpoint is unavailable. */
        }
      }
      await admin.from("integration_credentials").delete().eq("integration_id", integration.id);
      await admin
        .from("integrations")
        .update({ status: "DISCONNECTED", scopes: [], last_verified_at: null })
        .eq("id", integration.id);
      await admin.from("audit_events").insert({
        organization_id: auth.organizationId,
        actor_user_id: auth.userId,
        actor_type: "USER",
        action: "APOLLO_DISCONNECTED",
        entity_type: "integration",
        entity_id: integration.id,
        immutable_data: {},
      });
    }
    return apiOk({ status: "DISCONNECTED" });
  } catch (error) {
    return apiError(error);
  }
}
