import { apiError, apiOk } from "@/lib/api";
import { requireAuth, isDemoMode } from "@/lib/auth";
import { demoCampaigns } from "@/lib/demo-data";
import { assertCsrf, hashIp } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@marlow/shared";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    if (isDemoMode()) {
      const campaign = demoCampaigns.find((item) => item.id === id);
      if (!campaign) throw new AppError("NOT_FOUND", "Campaign was not found.", 404);
      return apiOk(campaign);
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*,campaign_profiles(*),campaign_limits(*),agent_runs(*),agent_run_events(*)")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .is("deleted_at", null)
      .single();
    if (error) throw new AppError("NOT_FOUND", "Campaign was not found.", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    if (isDemoMode()) return apiOk({ id, message: "Demo campaign deleted for this session." });

    const supabase = await createSupabaseServerClient();
    const { data: campaign, error: findError } = await supabase
      .from("campaigns")
      .select("id,name,status")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!campaign) throw new AppError("NOT_FOUND", "Campaign was not found.", 404);

    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient();
    const cleanupResults = await Promise.all([
      admin
        .from("agent_jobs")
        .update({ status: "CANCELLED", locked_at: null, locked_by: null, heartbeat_at: null })
        .eq("organization_id", auth.organizationId)
        .eq("campaign_id", id)
        .in("status", ["QUEUED", "RETRY", "RUNNING"]),
      admin
        .from("agent_runs")
        .update({ status: "CANCELLED", completed_at: now })
        .eq("organization_id", auth.organizationId)
        .eq("campaign_id", id)
        .in("status", ["QUEUED", "RUNNING", "WAITING"]),
      admin
        .from("email_sends")
        .update({ status: "FAILED", last_error: "CAMPAIGN_DELETED" })
        .eq("organization_id", auth.organizationId)
        .eq("campaign_id", id)
        .eq("status", "QUEUED"),
      admin
        .from("email_follow_up_monitors")
        .update({ status: "DISMISSED", locked_at: null, locked_by: null })
        .eq("organization_id", auth.organizationId)
        .eq("campaign_id", id)
        .in("status", ["WAITING", "FOLLOW_UP_NEEDED"]),
      admin
        .from("outreach_drafts")
        .update({ deleted_at: now })
        .eq("organization_id", auth.organizationId)
        .eq("campaign_id", id)
        .is("deleted_at", null),
    ]);
    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) throw new Error(cleanupError.message);

    const { data: deleted, error: deleteError } = await supabase
      .from("campaigns")
      .update({ deleted_at: now })
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (deleteError) throw new Error(deleteError.message);
    if (!deleted) throw new AppError("NOT_FOUND", "Campaign was not found.", 404);

    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "CAMPAIGN_DELETED",
      entity_type: "campaign",
      entity_id: id,
      campaign_id: id,
      immutable_data: { name: campaign.name, previousStatus: campaign.status },
      ip_hash: hashIp(request.headers.get("x-forwarded-for")),
    });
    return apiOk({ id, message: "Campaign deleted." });
  } catch (error) {
    return apiError(error);
  }
}
