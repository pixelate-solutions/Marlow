import { ModelUnavailableError } from "@marlow/agent";
import { AppError } from "@marlow/shared";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { runDiscovery } from "@/lib/discovery";
import { shouldStoreDiscoveryAnswer, type DiscoveryHistoryMessage } from "@/lib/discovery-messages";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const messageSchema = z.object({ content: z.string().trim().min(1).max(10_000) });

function demoTurn(content: string) {
  const lower = content.toLowerCase();
  if (/vp|director|operations|coo|owner/.test(lower))
    return {
      assistantMessage:
        "Good, those roles give me a clear persona. What company sizes and geographies should I prioritize or exclude?",
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
    const { data: rows, error: historyError } = await supabase
      .from("campaign_messages")
      .select("role,content")
      .eq("conversation_id", conversation.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (historyError) throw new Error(historyError.message);
    const history: DiscoveryHistoryMessage[] = (rows ?? []).reverse().map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));
    if (shouldStoreDiscoveryAnswer(history, input.content)) {
      const userMessageResult = await supabase.from("campaign_messages").insert({
        organization_id: auth.organizationId,
        conversation_id: conversation.id,
        campaign_id: id,
        role: "user",
        content: input.content,
      });
      if (userMessageResult.error) throw new Error(userMessageResult.error.message);
      history.push({ role: "user", content: input.content });
    }
    const turn = await runDiscovery(history);
    const assistantMessageResult = await supabase.from("campaign_messages").insert({
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
    if (assistantMessageResult.error) throw new Error(assistantMessageResult.error.message);
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
    if (error instanceof ModelUnavailableError) {
      if (process.env.NODE_ENV !== "test") {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Campaign discovery model request failed",
            error: error.message,
          }),
        );
      }
      return apiError(
        new AppError(
          "MODEL_UNAVAILABLE",
          "Marlow could not complete that turn. Your answer was saved. Please select send to retry.",
          503,
        ),
      );
    }
    return apiError(error);
  }
}
