import { sendingSettingsSchema } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { demoSendingSettings } from "@/lib/demo-data";
import { setDefaultMailbox } from "@/lib/mailboxes";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (isDemoMode()) return apiOk(demoSendingSettings);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("organizations")
      .select("sending_settings")
      .eq("id", auth.organizationId)
      .single();
    if (error) throw new Error(error.message);
    return apiOk(data.sending_settings);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin"]);
    const input = sendingSettingsSchema.parse(await request.json());
    if (isDemoMode())
      return apiOk({
        ...input,
        message: "Demo sending guardrails saved locally for this request.",
      });
    if (input.defaultMailboxId)
      await setDefaultMailbox({
        organizationId: auth.organizationId,
        mailboxId: input.defaultMailboxId,
      });
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("organizations")
      .update({ sending_settings: input })
      .eq("id", auth.organizationId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "SENDING_SETTINGS_UPDATED",
      entity_type: "organization",
      entity_id: auth.organizationId,
      immutable_data: {
        dailyLimit: input.dailyLimit,
        organizationDailyLimit: input.organizationDailyLimit,
        allowedDays: input.allowedDays,
        timezone: input.timezone,
      },
    });
    return apiOk({ ...input, message: "Sending guardrails saved." });
  } catch (error) {
    return apiError(error);
  }
}
