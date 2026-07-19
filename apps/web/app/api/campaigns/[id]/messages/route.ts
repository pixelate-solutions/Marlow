import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { runDiscovery } from "@/lib/discovery";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const messageSchema = z.object({ content: z.string().trim().min(1).max(10_000) });

function demoTurn(content: string) {
  const lower = content.toLowerCase();
  if (/vp|director|operations|coo|owner/.test(lower))
    return {
      assistantMessage:
        "Good—those roles give me a clear persona. What company sizes and geographies should I prioritize or exclude?",
      readinessScore: 54,
    };
  if (/employee|revenue|united states|midwest|detroit|chicago/.test(lower))
    return {
      assistantMessage:
        "That narrows the account search. What proof am I allowed to use, and what simple call to action should the first email make?",
      readinessScore: 71,
    };
  if (/call|meeting|case study|customer|proof/.test(lower))
    return {
      assistantMessage:
        "Almost there. Which Apollo mailbox should send, what daily cap should I enforce, and what postal address belongs in the footer?",
      readinessScore: 86,
    };
  return {
    assistantMessage:
      "Which roles experience this problem most directly, and who typically owns the decision?",
    readinessScore: 42,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    const input = messageSchema.parse(await request.json());
    if (isDemoMode()) return apiOk(demoTurn(input.content));
    const supabase = await createSupabaseServerClient();
    const { data: conversation, error } = await supabase
      .from("campaign_conversations")
      .select("id")
      .eq("campaign_id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("campaign_messages").insert({
      organization_id: auth.organizationId,
      conversation_id: conversation.id,
      campaign_id: id,
      role: "user",
      content: input.content,
    });
    const { data: rows, error: historyError } = await supabase
      .from("campaign_messages")
      .select("role,content")
      .eq("conversation_id", conversation.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(100);
    if (historyError) throw new Error(historyError.message);
    const turn = await runDiscovery(
      (rows ?? []).map((row) => ({ role: row.role as "user" | "assistant", content: row.content })),
    );
    await supabase.from("campaign_messages").insert({
      organization_id: auth.organizationId,
      conversation_id: conversation.id,
      campaign_id: id,
      role: "assistant",
      content: turn.assistantMessage,
      structured_data: {
        ready: turn.ready,
        missingRequiredFields: turn.missingRequiredFields,
        unresolvedQuestions: turn.unresolvedQuestions,
      },
    });
    if (turn.ready && turn.profile) {
      await supabase
        .from("campaign_profiles")
        .update({ is_current: false })
        .eq("campaign_id", id)
        .eq("is_current", true);
      await supabase.from("campaign_profiles").insert({
        organization_id: auth.organizationId,
        campaign_id: id,
        profile: turn.profile,
        readiness_score: turn.profile.readiness.score,
        missing_required_fields: turn.profile.readiness.missingRequiredFields,
        unresolved_questions: turn.profile.readiness.unresolvedQuestions,
        is_current: true,
      });
      await supabase.from("campaign_limits").upsert({
        organization_id: auth.organizationId,
        campaign_id: id,
        requested_prospects: turn.profile.limits.requestedProspects,
        daily_send_limit: turn.profile.limits.dailySendLimit,
        apollo_credit_budget: turn.profile.limits.apolloCreditBudget,
      });
      await supabase
        .from("campaigns")
        .update({ status: "READY", objective: turn.profile.campaignObjective })
        .eq("id", id);
    }
    return apiOk({
      assistantMessage: turn.assistantMessage,
      readinessScore:
        turn.profile?.readiness.score ?? Math.max(0, 100 - turn.missingRequiredFields.length * 7),
      ready: turn.ready,
    });
  } catch (error) {
    return apiError(error);
  }
}
