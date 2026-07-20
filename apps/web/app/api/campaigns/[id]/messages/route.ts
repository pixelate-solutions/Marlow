import { calculateReadiness, ModelUnavailableError } from "@marlow/agent";
import { AppError, sendingSettingsSchema, toErrorResponse } from "@marlow/shared";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import type { DiscoveryActivity } from "@/lib/discovery-activity";
import { discoveryTurnNeedsRecovery, recoveryDiscoveryTurn, runDiscovery } from "@/lib/discovery";
import { shouldStoreDiscoveryAnswer, type DiscoveryHistoryMessage } from "@/lib/discovery-messages";
import { getDefaultSendingMailbox } from "@/lib/mailboxes";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const messageSchema = z.object({ content: z.string().trim().min(1).max(10_000) });

export const maxDuration = 120;

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
        "Almost there. Which connected mailbox should send, what daily cap should I enforce, and what postal address belongs in the footer?",
      readinessScore: 86,
    };
  return {
    assistantMessage:
      "Which roles experience this problem most directly, and who typically owns the decision?",
    readinessScore: 42,
  };
}

type ActivityEmitter = (activity: DiscoveryActivity) => void;

function normalizeDiscoveryError(error: unknown): unknown {
  if (!(error instanceof ModelUnavailableError)) return error;
  if (process.env.NODE_ENV !== "test") {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Campaign discovery model request failed",
        error: error.message,
      }),
    );
  }
  return new AppError(
    "MODEL_UNAVAILABLE",
    "Marlow could not complete that turn. Your answer was saved. Please select send to retry.",
    503,
  );
}

async function processCampaignMessage(request: Request, id: string, emit?: ActivityEmitter) {
  const activities: DiscoveryActivity[] = [];
  const publish = (activity: DiscoveryActivity) => {
    const index = activities.findIndex((item) => item.id === activity.id);
    if (index === -1) activities.push(activity);
    else activities[index] = activity;
    emit?.(activity);
  };
  assertCsrf(request);
  const auth = await requireAuth(["owner", "admin", "member"]);
  const input = messageSchema.parse(await request.json());
  if (isDemoMode()) return { ...demoTurn(input.content), activity: activities };
  const supabase = await createSupabaseServerClient();
  const contextStartedAt = Date.now();
  publish({
    id: "context",
    kind: "tool",
    label: "Campaign memory",
    detail: "Loading saved discovery messages.",
    status: "running",
  });
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
  publish({
    id: "context",
    kind: "tool",
    label: "Campaign memory",
    detail: `Loaded ${history.length} saved messages.`,
    status: "complete",
    durationMs: Date.now() - contextStartedAt,
  });
  const answerStartedAt = Date.now();
  publish({
    id: "answer",
    kind: "tool",
    label: "Campaign memory",
    detail: "Saving your answer.",
    status: "running",
  });
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
  publish({
    id: "answer",
    kind: "tool",
    label: "Campaign memory",
    detail: "Your answer is saved.",
    status: "complete",
    durationMs: Date.now() - answerStartedAt,
  });
  const senderStartedAt = Date.now();
  publish({
    id: "sender",
    kind: "tool",
    label: "Sender settings",
    detail: "Checking the default sending mailbox and guardrails.",
    status: "running",
  });
  const [mailbox, organizationResult] = await Promise.all([
    getDefaultSendingMailbox(auth.organizationId),
    supabase
      .from("organizations")
      .select("sending_settings")
      .eq("id", auth.organizationId)
      .single(),
  ]);
  if (organizationResult.error) throw new Error(organizationResult.error.message);
  const settings = sendingSettingsSchema.safeParse(organizationResult.data.sending_settings);
  const connectedMailbox = mailbox
    ? {
        id: mailbox.id,
        email: mailbox.email,
        displayName: mailbox.displayName,
        signature:
          mailbox.signatureText ||
          [
            settings.success ? settings.data.senderName : mailbox.displayName,
            settings.success ? settings.data.senderTitle : "",
          ]
            .filter(Boolean)
            .join("\n"),
        postalAddress: settings.success ? settings.data.postalAddress : "",
        ...(settings.success && settings.data.senderTitle
          ? { senderTitle: settings.data.senderTitle }
          : {}),
      }
    : undefined;
  publish({
    id: "sender",
    kind: "tool",
    label: "Sender settings",
    detail: connectedMailbox
      ? "A default sending mailbox is available."
      : "No default sending mailbox is connected yet.",
    status: "complete",
    durationMs: Date.now() - senderStartedAt,
  });
  let recoveredFromModelFailure = false;
  let recoveredFromInvalidTurn = false;
  const modelStartedAt = Date.now();
  publish({
    id: "model",
    kind: "model",
    label: "Muse Spark 1.1",
    detail: "Checking campaign completeness and choosing one next question.",
    status: "running",
  });
  let modelTurn: Awaited<ReturnType<typeof runDiscovery>>;
  try {
    modelTurn = await runDiscovery(history, connectedMailbox);
    publish({
      id: "model",
      kind: "model",
      label: "Muse Spark 1.1",
      detail: "The model returned a structured discovery turn.",
      status: "complete",
      durationMs: Date.now() - modelStartedAt,
    });
  } catch (modelError) {
    if (!(modelError instanceof ModelUnavailableError) || !modelError.retryable) {
      publish({
        id: "model",
        kind: "model",
        label: "Muse Spark 1.1",
        detail: "The model request failed.",
        status: "warning",
        durationMs: Date.now() - modelStartedAt,
      });
      throw modelError;
    }
    recoveredFromModelFailure = true;
    modelTurn = recoveryDiscoveryTurn(history);
    publish({
      id: "model",
      kind: "model",
      label: "Muse Spark 1.1",
      detail: "The model timed out after its retry. Marlow continued with a safe fallback.",
      status: "warning",
      durationMs: Date.now() - modelStartedAt,
    });
    publish({
      id: "recovery",
      kind: "recovery",
      label: "Discovery recovery",
      detail: "Selected the next unanswered required field.",
      status: "complete",
    });
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        JSON.stringify({
          level: "warning",
          message: "Campaign discovery recovered from a transient model failure",
          error: modelError.message,
          campaignId: id,
          elapsedMs: Date.now() - modelStartedAt,
        }),
      );
    }
  }
  const validationStartedAt = Date.now();
  publish({
    id: "validation",
    kind: "validation",
    label: "Response validator",
    detail: "Checking that the response contains one actionable next question.",
    status: "running",
  });
  if (discoveryTurnNeedsRecovery(modelTurn)) {
    recoveredFromInvalidTurn = true;
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        JSON.stringify({
          level: "warning",
          message: "Campaign discovery replaced an invalid model turn",
          campaignId: id,
          missingFieldCount: modelTurn.missingRequiredFields.length,
          unresolvedQuestionCount: modelTurn.unresolvedQuestions.length,
          assistantMessageContainedQuestion: modelTurn.assistantMessage.includes("?"),
        }),
      );
    }
    modelTurn = recoveryDiscoveryTurn(history);
    publish({
      id: "validation",
      kind: "validation",
      label: "Response validator",
      detail: "Replaced a status-only response with the next required question.",
      status: "warning",
      durationMs: Date.now() - validationStartedAt,
    });
    publish({
      id: "recovery",
      kind: "recovery",
      label: "Discovery recovery",
      detail: "Selected the next unanswered required field.",
      status: "complete",
    });
  } else {
    publish({
      id: "validation",
      kind: "validation",
      label: "Response validator",
      detail: modelTurn.ready
        ? "The campaign profile is complete and valid."
        : `Required details still remaining: ${modelTurn.missingRequiredFields.length}.`,
      status: "complete",
      durationMs: Date.now() - validationStartedAt,
    });
  }
  const profile =
    modelTurn.profile && connectedMailbox
      ? {
          ...modelTurn.profile,
          sender: {
            ...modelTurn.profile.sender,
            name: connectedMailbox.displayName,
            sendingMailboxId: connectedMailbox.id,
            signature: connectedMailbox.signature,
            postalAddress: connectedMailbox.postalAddress,
            ...(connectedMailbox.senderTitle ? { title: connectedMailbox.senderTitle } : {}),
          },
        }
      : modelTurn.profile;
  const readiness = profile ? calculateReadiness(profile) : null;
  const turn = {
    ...modelTurn,
    assistantMessage:
      modelTurn.ready && !connectedMailbox
        ? "Your campaign details are ready. Connect Gmail or Microsoft and choose a default sender before starting."
        : modelTurn.assistantMessage,
    profile: profile
      ? {
          ...profile,
          readiness: readiness ?? profile.readiness,
        }
      : undefined,
    ready: Boolean(modelTurn.ready && profile && readiness?.ready && connectedMailbox),
    missingRequiredFields: [
      ...(readiness?.missingRequiredFields ?? modelTurn.missingRequiredFields),
      ...(!connectedMailbox ? ["sender.sendingMailboxId"] : []),
    ],
    unresolvedQuestions: [
      ...(readiness?.unresolvedQuestions ?? modelTurn.unresolvedQuestions),
      ...(!connectedMailbox
        ? ["Connect a Gmail or Microsoft mailbox and choose a default sender."]
        : []),
    ],
  };
  const readinessScore =
    turn.profile?.readiness.score ?? Math.max(0, 100 - turn.missingRequiredFields.length * 7);
  const saveStartedAt = Date.now();
  publish({
    id: "save",
    kind: "tool",
    label: "Campaign memory",
    detail: "Saving the validated response and readiness state.",
    status: "running",
  });
  const structuredData = {
    ready: turn.ready,
    readinessScore,
    missingRequiredFields: turn.missingRequiredFields,
    unresolvedQuestions: turn.unresolvedQuestions,
    recoveredFromModelFailure,
    recoveredFromInvalidTurn,
  };
  const assistantMessageResult = await supabase
    .from("campaign_messages")
    .insert({
      organization_id: auth.organizationId,
      conversation_id: conversation.id,
      campaign_id: id,
      role: "assistant",
      content: turn.assistantMessage,
      structured_data: structuredData,
    })
    .select("id")
    .single();
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
  publish({
    id: "save",
    kind: "tool",
    label: "Campaign memory",
    detail: "The response and readiness state are saved.",
    status: "complete",
    durationMs: Date.now() - saveStartedAt,
  });
  const activityResult = await supabase
    .from("campaign_messages")
    .update({ structured_data: { ...structuredData, publicActivity: activities } })
    .eq("id", assistantMessageResult.data.id);
  if (activityResult.error && process.env.NODE_ENV !== "test") {
    console.warn(
      JSON.stringify({
        level: "warning",
        message: "Campaign discovery activity could not be attached to the saved response",
        campaignId: id,
        error: activityResult.error.message,
      }),
    );
  }
  return {
    assistantMessage: turn.assistantMessage,
    readinessScore,
    ready: turn.ready,
    activity: activities,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    assertCsrf(request);
  } catch (error) {
    return apiError(error);
  }
  const wantsActivityStream = request.headers.get("accept")?.includes("text/event-stream");
  if (!wantsActivityStream) {
    try {
      return apiOk(await processCampaignMessage(request, id));
    } catch (error) {
      return apiError(normalizeDiscoveryError(error));
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, value: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      void processCampaignMessage(request, id, (activity) => send("activity", activity))
        .then((data) => send("result", { data }))
        .catch((error: unknown) => {
          const normalized = normalizeDiscoveryError(error);
          if (
            process.env.NODE_ENV !== "test" &&
            !(normalized instanceof Error && normalized.name === "AppError")
          ) {
            console.error(
              JSON.stringify({
                level: "error",
                message: "API request failed",
                error: normalized instanceof Error ? normalized.message : String(normalized),
              }),
            );
          }
          const response = toErrorResponse(normalized);
          send("error", { ...response.body, status: response.status });
        })
        .finally(() => controller.close());
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
