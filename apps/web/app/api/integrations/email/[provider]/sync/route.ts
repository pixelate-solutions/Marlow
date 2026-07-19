import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { providerFromSlug, syncProviderMailboxes } from "@/lib/mailboxes";
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
    const admin = createSupabaseAdminClient();
    const { data: integration, error } = await admin
      .from("integrations")
      .select("id,status")
      .eq("organization_id", auth.organizationId)
      .eq("provider", provider)
      .single();
    if (error || integration.status !== "CONNECTED")
      throw new AppError("MAILBOX_NOT_CONNECTED", "Connect this mailbox first.", 409);
    const mailboxes = await syncProviderMailboxes({
      organizationId: auth.organizationId,
      integrationId: integration.id,
      provider,
    });
    return apiOk({ status: "CONNECTED", mailboxes });
  } catch (error) {
    return apiError(error);
  }
}
