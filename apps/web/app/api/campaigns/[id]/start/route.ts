import { randomUUID } from "node:crypto";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf, hashIp } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@marlow/shared";
import { getDefaultSendingMailbox } from "@/lib/mailboxes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      apolloCreditBudget?: unknown;
    };
    const requestedCreditBudget = body.apolloCreditBudget;
    if (
      requestedCreditBudget !== undefined &&
      (typeof requestedCreditBudget !== "number" ||
        !Number.isInteger(requestedCreditBudget) ||
        requestedCreditBudget < 1 ||
        requestedCreditBudget > 100_000)
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Apollo lead credit budget must be a whole number between 1 and 100000.",
        400,
      );
    if (isDemoMode())
      return apiOk({ campaignId: id, runId: randomUUID(), status: "QUEUED", demo: true });
    const supabase = await createSupabaseServerClient();
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("status,campaign_profiles(id,profile)")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .eq("campaign_profiles.is_current", true)
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
    const profileRow = Array.isArray(campaign.campaign_profiles)
      ? campaign.campaign_profiles[0]
      : campaign.campaign_profiles;
    const profile = profileRow?.profile as
      | {
          limits?: { apolloCreditBudget?: unknown; [key: string]: unknown };
          [key: string]: unknown;
        }
      | undefined;
    const currentCreditBudget = Number(profile?.limits?.apolloCreditBudget ?? 0);
    if (requestedCreditBudget === undefined && currentCreditBudget <= 0)
      throw new AppError(
        "APOLLO_CREDIT_BUDGET_REACHED",
        "Set an Apollo lead credit budget greater than 0 before retrying.",
        409,
      );
    if (requestedCreditBudget !== undefined) {
      if (!profileRow || !profile)
        throw new AppError("NOT_FOUND", "Campaign profile was not found.", 409);
      const apolloCreditBudget = Number(requestedCreditBudget);
      const [profileResult, limitResult] = await Promise.all([
        supabase
          .from("campaign_profiles")
          .update({
            profile: {
              ...profile,
              limits: { ...profile.limits, apolloCreditBudget },
            },
          })
          .eq("id", profileRow.id)
          .eq("organization_id", auth.organizationId),
        supabase
          .from("campaign_limits")
          .update({ apollo_credit_budget: apolloCreditBudget })
          .eq("campaign_id", id)
          .eq("organization_id", auth.organizationId),
      ]);
      const budgetError = profileResult.error ?? limitResult.error;
      if (budgetError) throw new Error(budgetError.message);
      await supabase.from("audit_events").insert({
        organization_id: auth.organizationId,
        actor_user_id: auth.userId,
        actor_type: "USER",
        action: "CAMPAIGN_APOLLO_BUDGET_UPDATED",
        entity_type: "campaign",
        entity_id: id,
        campaign_id: id,
        immutable_data: {
          previousCreditBudget: currentCreditBudget,
          apolloCreditBudget,
        },
        ip_hash: hashIp(request.headers.get("x-forwarded-for")),
      });
    }
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
