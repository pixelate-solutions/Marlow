import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { requireAuth, isDemoMode } from "@/lib/auth";
import { DEMO_IDS, demoCampaigns } from "@/lib/demo-data";
import type { DiscoveryActivity } from "@/lib/discovery-activity";
import { assertCsrf, hashIp } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120).default("Untitled campaign"),
  objective: z.string().trim().max(500).default(""),
  initialMessage: z.string().trim().min(1).max(10_000).optional(),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.demo) return apiOk(demoCampaigns);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return apiOk(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const input = createCampaignSchema.parse(await request.json());
    const activity: DiscoveryActivity[] = input.initialMessage
      ? [
          {
            id: "campaign",
            kind: "tool",
            label: "Campaign memory",
            detail: "Created the campaign and saved your opening answer.",
            status: "complete",
          },
          {
            id: "validation",
            kind: "validation",
            label: "Discovery planner",
            detail: "Selected the next required campaign detail.",
            status: "complete",
          },
        ]
      : [];
    if (isDemoMode())
      return apiOk(
        {
          id: DEMO_IDS.campaign,
          status: "DISCOVERING",
          assistantMessage:
            "That gives me a useful starting point. Which roles feel the pain most directly, and who normally owns the buying decision?",
          readinessScore: 36,
          activity,
        },
        { status: 201 },
      );
    const supabase = await createSupabaseServerClient();
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        organization_id: auth.organizationId,
        created_by: auth.userId,
        name: input.name,
        objective: input.objective,
        status: "DISCOVERING",
      })
      .select("id,status")
      .single();
    if (error) throw new Error(error.message);
    const { data: conversation, error: conversationError } = await supabase
      .from("campaign_conversations")
      .insert({ organization_id: auth.organizationId, campaign_id: campaign.id })
      .select("id")
      .single();
    if (conversationError) throw new Error(conversationError.message);
    const assistantMessage = input.initialMessage
      ? "Thanks, that’s a useful starting point. Which roles feel the problem most directly, and who normally owns the buying decision?"
      : "Tell me about your company, what you sell, and who you are trying to reach.";
    const readinessScore = input.initialMessage ? 24 : 18;
    const messages = [
      {
        organization_id: auth.organizationId,
        conversation_id: conversation.id,
        campaign_id: campaign.id,
        role: "assistant",
        content: "Tell me about your company, what you sell, and who you are trying to reach.",
      },
      ...(input.initialMessage
        ? [
            {
              organization_id: auth.organizationId,
              conversation_id: conversation.id,
              campaign_id: campaign.id,
              role: "user",
              content: input.initialMessage,
            },
            {
              organization_id: auth.organizationId,
              conversation_id: conversation.id,
              campaign_id: campaign.id,
              role: "assistant",
              content: assistantMessage,
              structured_data: { ready: false, readinessScore, publicActivity: activity },
            },
          ]
        : []),
    ];
    const messageResult = await supabase.from("campaign_messages").insert(messages);
    if (messageResult.error) throw new Error(messageResult.error.message);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "CAMPAIGN_CREATED",
      entity_type: "campaign",
      entity_id: campaign.id,
      campaign_id: campaign.id,
      immutable_data: { name: input.name, objective: input.objective },
      ip_hash: hashIp(request.headers.get("x-forwarded-for")),
    });
    return apiOk(
      {
        ...campaign,
        assistantMessage,
        readinessScore,
        ready: false,
        activity,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
