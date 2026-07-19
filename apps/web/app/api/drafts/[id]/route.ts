import { z } from "zod";
import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { demoDrafts } from "@/lib/demo-data";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const updateSchema = z
  .object({
    subject: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    if (isDemoMode()) {
      const draft = demoDrafts.find((item) => item.id === id);
      if (!draft) throw new AppError("NOT_FOUND", "Draft was not found.", 404);
      return apiOk(draft);
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("outreach_drafts")
      .select("*,prospects(*,companies(*)),prospect_research(*,research_claims(*)),lead_scores(*)")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw new AppError("NOT_FOUND", "Draft was not found.", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    if (isDemoMode())
      return apiOk({
        id,
        ...input,
        status: "PENDING_USER_APPROVAL",
        message: "Demo draft updated; any earlier approval is invalid.",
      });
    const supabase = await createSupabaseServerClient();
    const { data: current, error: loadError } = await supabase
      .from("outreach_drafts")
      .select("id,revision,subject,body,campaign_id,prospect_id")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (loadError) throw new AppError("NOT_FOUND", "Draft was not found.", 404);
    await supabase.from("draft_revisions").insert({
      organization_id: auth.organizationId,
      draft_id: id,
      revision: current.revision,
      subject: current.subject,
      body: current.body,
      edit_source: "USER",
      edited_by: auth.userId,
    });
    const { data, error } = await supabase
      .from("outreach_drafts")
      .update(input)
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .select("id,revision,subject,body,status")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "DRAFT_EDITED",
      entity_type: "outreach_draft",
      entity_id: id,
      campaign_id: current.campaign_id,
      prospect_id: current.prospect_id,
      immutable_data: {
        revision: data.revision,
        subjectHashChanged: current.subject !== input.subject,
        bodyHashChanged: current.body !== input.body,
      },
    });
    return apiOk({ ...data, message: "Draft updated; any earlier approval is invalid." });
  } catch (error) {
    return apiError(error);
  }
}
