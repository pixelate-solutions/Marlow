import { randomUUID } from "node:crypto";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@marlow/shared";
import { getDefaultSendingMailbox } from "@/lib/mailboxes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    if (isDemoMode())
      return apiOk({ campaignId: id, runId: randomUUID(), status: "QUEUED", demo: true });
    const supabase = await createSupabaseServerClient();
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("status")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw new AppError("NOT_FOUND", "Campaign was not found.", 404);
    if (campaign.status !== "READY" && campaign.status !== "PAUSED" && campaign.status !== "FAILED")
      throw new AppError("CONFLICT", "Campaign is not ready to start.", 409);
    const mailbox = await getDefaultSendingMailbox(auth.organizationId);
    if (!mailbox)
      throw new AppError(
        "MAILBOX_NOT_CONNECTED",
        "Connect Gmail or Microsoft and choose a default sending mailbox before starting.",
        409,
      );
    const admin = createSupabaseAdminClient();
    const { data: run, error: runError } = await admin
      .from("agent_runs")
      .insert({ organization_id: auth.organizationId, campaign_id: id, status: "QUEUED" })
      .select("id")
      .single();
    if (runError) throw new Error(runError.message);
    const { error: jobError } = await admin.from("agent_jobs").insert({
      organization_id: auth.organizationId,
      campaign_id: id,
      run_id: run.id,
      job_type: "CAMPAIGN_RUN",
      payload: { runId: run.id },
    });
    if (jobError) throw new Error(jobError.message);
    await supabase
      .from("campaigns")
      .update({ status: "QUEUED", started_at: new Date().toISOString() })
      .eq("id", id);
    return apiOk({ campaignId: id, runId: run.id, status: "QUEUED" }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
