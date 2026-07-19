import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ reason: z.string().trim().min(1).max(1_000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth();
    const { id } = await params;
    const { reason } = schema.parse(await request.json());
    if (isDemoMode()) return apiOk({ id, message: "Demo research report recorded." });
    const supabase = await createSupabaseServerClient();
    const { data: draft, error } = await supabase
      .from("outreach_drafts")
      .select("campaign_id,prospect_id")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "BAD_RESEARCH_REPORTED",
      entity_type: "outreach_draft",
      entity_id: id,
      campaign_id: draft.campaign_id,
      prospect_id: draft.prospect_id,
      immutable_data: { reason },
    });
    return apiOk({ id, message: "Research report recorded for review." });
  } catch (error) {
    return apiError(error);
  }
}
