import { readFile } from "node:fs/promises";
import path from "node:path";
import { MuseSparkProvider, validateEmailCompliance } from "@marlow/agent";
import { AppError, outreachDraftSchema } from "@marlow/shared";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { demoDrafts } from "@/lib/demo-data";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({ instruction: z.string().trim().min(1).max(1_000) });
const reviewSchema = z.object({
  approved: z.boolean(),
  findings: z.array(z.string()),
  revisedDraft: outreachDraftSchema.optional(),
});

function demoRevision(body: string, instruction: string): string {
  if (/short/i.test(instruction)) return body.split("\n\n").slice(0, 2).join("\n\n");
  if (/conversational/i.test(instruction))
    return body.replace("That often makes it harder", "I imagine that can make it harder");
  if (/direct/i.test(instruction))
    return body.replace(
      "Would comparing notes for 15 minutes next week be useful?",
      "Open to a 15-minute conversation next week?",
    );
  return body.replace("scattered workflow data", "day-to-day workflow data");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    const { instruction } = inputSchema.parse(await request.json());
    if (isDemoMode()) {
      const draft = demoDrafts.find((item) => item.id === id);
      if (!draft) throw new AppError("NOT_FOUND", "Draft was not found.", 404);
      return apiOk({
        id,
        subject: draft.subject,
        body: demoRevision(draft.body, instruction),
        message: "Demo draft regenerated and re-reviewed.",
      });
    }
    const apiKey = process.env.MODEL_API_KEY;
    if (!apiKey) throw new AppError("MODEL_UNAVAILABLE", "Muse Spark is not configured.", 503);
    const supabase = await createSupabaseServerClient();
    const { data: draft, error } = await supabase
      .from("outreach_drafts")
      .select(
        "*,campaigns(campaign_profiles(profile)),prospects(first_name,last_name,title,companies(name)),prospect_research(*,research_claims(*))",
      )
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw new AppError("NOT_FOUND", "Draft was not found.", 404);
    const systemPrompt = await readFile(
      path.resolve(process.cwd(), "../../packages/agent/prompts/outbound-agent.md"),
      "utf8",
    );
    const model = new MuseSparkProvider({
      apiKey,
      ...(process.env.META_MODEL_API_BASE_URL
        ? { baseUrl: process.env.META_MODEL_API_BASE_URL }
        : {}),
    });
    const campaign = Array.isArray(draft.campaigns) ? draft.campaigns[0] : draft.campaigns;
    const profileContainer =
      campaign &&
      (Array.isArray(campaign.campaign_profiles)
        ? campaign.campaign_profiles[0]
        : campaign.campaign_profiles);
    const prospect = Array.isArray(draft.prospects) ? draft.prospects[0] : draft.prospects;
    const research = Array.isArray(draft.prospect_research)
      ? draft.prospect_research[0]
      : draft.prospect_research;
    const claims = research?.research_claims ?? [];
    const generated = await model.generateStructured({
      schema: outreachDraftSchema,
      schemaName: "outreach_draft_regeneration",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Revise this draft using the user's instruction: ${JSON.stringify(instruction)}. Trusted campaign: ${JSON.stringify(profileContainer?.profile)}. Prospect: ${JSON.stringify(prospect)}. Verified claims only: ${JSON.stringify(claims)}. Current draft: ${JSON.stringify({ subject: draft.subject, body: draft.body })}. Never introduce unsupported facts.`,
        },
      ],
    });
    const reviewed = await model.generateStructured({
      schema: reviewSchema,
      schemaName: "outreach_regeneration_review",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Independently review this revision for grounding, clarity, concision, natural tone, one CTA, prohibited language, and compliance. Claims: ${JSON.stringify(claims)}. Draft: ${JSON.stringify(generated.value)}.`,
        },
      ],
    });
    const finalDraft = reviewed.value.approved ? generated.value : reviewed.value.revisedDraft;
    if (!finalDraft)
      throw new AppError(
        "VALIDATION_ERROR",
        "The regenerated email did not pass grounding review.",
        422,
      );
    const compliance = validateEmailCompliance({
      subject: finalDraft.subject,
      body: finalDraft.body,
      profile: profileContainer?.profile,
    });
    if (!compliance.valid)
      throw new AppError(
        "VALIDATION_ERROR",
        "The regenerated email did not pass deterministic compliance checks.",
        422,
        { warnings: compliance.warnings },
      );
    await supabase.from("draft_revisions").insert({
      organization_id: auth.organizationId,
      draft_id: id,
      revision: draft.revision,
      subject: draft.subject,
      body: draft.body,
      edit_source: "REGENERATION",
      edited_by: auth.userId,
      feedback: instruction,
    });
    const { error: updateError } = await supabase
      .from("outreach_drafts")
      .update({
        subject: finalDraft.subject,
        body: finalDraft.body,
        personalization_summary: finalDraft.personalizationSummary,
        selected_angle: finalDraft.selectedAngle,
        qualification_summary: finalDraft.qualificationSummary,
        supporting_claim_ids: finalDraft.supportingClaimIds,
        confidence: finalDraft.confidence,
        compliance_warnings: finalDraft.complianceWarnings,
      })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);
    return apiOk({
      id,
      subject: finalDraft.subject,
      body: finalDraft.body,
      message: "Draft regenerated and passed a separate grounding review.",
    });
  } catch (error) {
    return apiError(error);
  }
}
