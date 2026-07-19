import { decryptSecret, type EncryptedSecret } from "@marlow/database";
import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { getSendingMailboxes, providerFromSlug, setDefaultMailbox } from "@/lib/mailboxes";
import { assertCsrf } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin"]);
    const { provider: slug } = await params;
    const provider = providerFromSlug(slug);
    if (!provider) throw new AppError("NOT_FOUND", "Email provider was not found.", 404);
    if (isDemoMode()) return apiOk({ status: "DISCONNECTED", demo: true });
    const admin = createSupabaseAdminClient();
    const { data: integration } = await admin
      .from("integrations")
      .select("id,integration_credentials(encrypted_payload,iv,auth_tag,key_version)")
      .eq("organization_id", auth.organizationId)
      .eq("provider", provider)
      .maybeSingle();
    if (integration && provider === "GMAIL" && process.env.ENCRYPTION_KEY) {
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
            refreshToken?: string;
          };
          const token = tokens.refreshToken ?? tokens.accessToken;
          if (token)
            await fetch("https://oauth2.googleapis.com/revoke", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ token }),
            });
        } catch {
          // Local revocation still proceeds if Google is unavailable.
        }
      }
    }
    if (integration) {
      await admin.from("sending_mailboxes").delete().eq("integration_id", integration.id);
      await admin.from("integration_credentials").delete().eq("integration_id", integration.id);
      await admin
        .from("integrations")
        .update({
          status: "DISCONNECTED",
          scopes: [],
          external_account_id: null,
          display_name: null,
          last_verified_at: null,
        })
        .eq("id", integration.id);
      const remaining = await getSendingMailboxes(auth.organizationId);
      const next = remaining.find((mailbox) => mailbox.status === "AVAILABLE");
      if (next)
        await setDefaultMailbox({ organizationId: auth.organizationId, mailboxId: next.id });
      else {
        const { data: organization } = await admin
          .from("organizations")
          .select("sending_settings")
          .eq("id", auth.organizationId)
          .single();
        const settings = (organization?.sending_settings ?? {}) as Record<string, unknown>;
        await admin
          .from("organizations")
          .update({ sending_settings: { ...settings, defaultMailboxId: "" } })
          .eq("id", auth.organizationId);
      }
      await admin.from("audit_events").insert({
        organization_id: auth.organizationId,
        actor_user_id: auth.userId,
        actor_type: "USER",
        action: `${provider}_DISCONNECTED`,
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
