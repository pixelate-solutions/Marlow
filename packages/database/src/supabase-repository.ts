import {
  AppError,
  campaignProfileSchema,
  normalizeConfidencePercent,
  type CampaignStatus,
} from "@marlow/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentJob,
  AgentRepository,
  CampaignRecord,
  CompanyInput,
  ProspectInput,
} from "./types";

function unwrap<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
}): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new AppError("NOT_FOUND", "Requested record was not found.", 404);
  return result.data;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class SupabaseAgentRepository implements AgentRepository {
  constructor(private readonly client: SupabaseClient) {}

  static fromServiceRole(url: string, serviceRoleKey: string): SupabaseAgentRepository {
    return new SupabaseAgentRepository(
      createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }

  async getCampaign(campaignId: string): Promise<CampaignRecord> {
    const row = unwrap(
      await this.client
        .from("campaigns")
        .select(
          "id, organization_id, name, objective, status, minimum_lead_score, campaign_profiles(profile)",
        )
        .eq("id", campaignId)
        .eq("campaign_profiles.is_current", true)
        .is("deleted_at", null)
        .single(),
    ) as unknown as {
      id: string;
      organization_id: string;
      name: string;
      objective: string;
      status: CampaignStatus;
      minimum_lead_score: number;
      campaign_profiles: Array<{ profile: unknown }> | { profile: unknown };
    };
    const profileContainer = Array.isArray(row.campaign_profiles)
      ? row.campaign_profiles[0]
      : row.campaign_profiles;
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      objective: row.objective,
      status: row.status,
      minimumLeadScore: row.minimum_lead_score,
      profile: campaignProfileSchema.parse(profileContainer?.profile),
    };
  }

  async transitionCampaign(
    campaignId: string,
    from: CampaignStatus[],
    to: CampaignStatus,
  ): Promise<void> {
    const { data, error } = await this.client
      .from("campaigns")
      .update({ status: to, status_changed_at: new Date().toISOString() })
      .eq("id", campaignId)
      .is("deleted_at", null)
      .in("status", from)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new AppError("CONFLICT", `Campaign cannot transition to ${to}.`, 409);
  }

  async appendRunEvent(input: {
    runId: string;
    organizationId: string;
    campaignId: string;
    type: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.client.from("agent_run_events").insert({
      agent_run_id: input.runId,
      organization_id: input.organizationId,
      campaign_id: input.campaignId,
      event_type: input.type,
      public_message: input.message,
      data: input.data ?? {},
    });
    if (error) throw new Error(error.message);
  }

  async saveCompany(input: CompanyInput): Promise<{ id: string }> {
    const result = await this.client
      .from("companies")
      .upsert(
        {
          organization_id: input.organizationId,
          apollo_id: input.apolloId,
          name: input.name,
          domain: input.domain.toLowerCase(),
          website_url: input.websiteUrl,
          industry: input.industry,
          employee_count: input.employeeCount,
          location: input.location,
          source_data: input.rawData ?? {},
        },
        { onConflict: "organization_id,domain" },
      )
      .select("id")
      .single();
    const data = unwrap(result) as { id: string };
    return data;
  }

  async saveProspect(input: ProspectInput): Promise<{ id: string; duplicate: boolean }> {
    const { data: existing, error: lookupError } = await this.client.rpc(
      "find_duplicate_prospect",
      {
        p_organization_id: input.organizationId,
        p_apollo_person_id: input.apolloPersonId ?? null,
        p_apollo_contact_id: input.apolloContactId ?? null,
        p_email: input.email ?? null,
        p_linkedin_url: input.linkedinUrl ?? null,
        p_full_name: `${input.firstName} ${input.lastName}`,
        p_company_id: input.companyId,
      },
    );
    if (lookupError) throw new Error(lookupError.message);
    if (existing) return { id: String(existing), duplicate: true };
    const row = unwrap(
      await this.client
        .from("prospects")
        .insert({
          organization_id: input.organizationId,
          campaign_id: input.campaignId,
          company_id: input.companyId,
          first_name: input.firstName,
          last_name: input.lastName,
          title: input.title,
          normalized_email: input.email?.toLowerCase(),
          email_status: input.emailStatus,
          linkedin_url: input.linkedinUrl,
          location: input.location,
          selection_reason: input.selectionReason,
          source_data: input.rawData ?? {},
        })
        .select("id")
        .single(),
    ) as { id: string };
    const identities = [
      input.apolloPersonId && { type: "APOLLO_PERSON_ID", value: input.apolloPersonId },
      input.apolloContactId && { type: "APOLLO_CONTACT_ID", value: input.apolloContactId },
      input.email && { type: "EMAIL", value: input.email.toLowerCase() },
      input.linkedinUrl && { type: "LINKEDIN_URL", value: input.linkedinUrl.toLowerCase() },
    ].filter(Boolean) as Array<{ type: string; value: string }>;
    if (identities.length > 0) {
      const { error } = await this.client.from("prospect_identities").insert(
        identities.map((identity) => ({
          organization_id: input.organizationId,
          prospect_id: row.id,
          identity_type: identity.type,
          identity_value: identity.value,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { id: row.id, duplicate: false };
  }

  async isSuppressed(input: {
    organizationId: string;
    email?: string;
    domain?: string;
    apolloPersonId?: string;
    apolloContactId?: string;
  }): Promise<boolean> {
    const { data, error } = await this.client.rpc("is_recipient_suppressed", {
      p_organization_id: input.organizationId,
      p_email: input.email ?? null,
      p_domain: input.domain ?? null,
      p_apollo_person_id: input.apolloPersonId ?? null,
      p_apollo_contact_id: input.apolloContactId ?? null,
    });
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async saveResearch(
    input: Parameters<AgentRepository["saveResearch"]>[0],
  ): Promise<{ claimIds: string[] }> {
    const research = unwrap(
      await this.client
        .from("prospect_research")
        .insert({
          organization_id: input.organizationId,
          campaign_id: input.campaignId,
          prospect_id: input.prospectId,
          company_summary: input.companySummary,
          signals: input.signals,
        })
        .select("id")
        .single(),
    ) as { id: string };
    if (input.claims.length === 0) return { claimIds: [] };
    const { data, error } = await this.client
      .from("research_claims")
      .insert(
        input.claims.map((claim) => ({
          organization_id: input.organizationId,
          prospect_research_id: research.id,
          claim: claim.claim,
          source_url: claim.sourceUrl,
          source_title: claim.sourceTitle,
          retrieved_at: claim.retrievedAt,
          confidence: claim.confidence,
          source_type: claim.sourceType,
        })),
      )
      .select("id");
    if (error) throw new Error(error.message);
    return { claimIds: (data ?? []).map((row) => String(row.id)) };
  }

  async saveLeadScore(input: Parameters<AgentRepository["saveLeadScore"]>[0]): Promise<void> {
    const { error } = await this.client.from("lead_scores").insert({
      organization_id: input.organizationId,
      campaign_id: input.campaignId,
      prospect_id: input.prospectId,
      total_score: input.total,
      components: input.components,
      explanation: input.explanation,
    });
    if (error) throw new Error(error.message);
  }

  async saveDraft(input: Parameters<AgentRepository["saveDraft"]>[0]): Promise<{ id: string }> {
    const [mailboxResult, organizationResult] = await Promise.all([
      isUuid(input.mailboxId)
        ? this.client
            .from("sending_mailboxes")
            .select(
              "id,provider,email,display_name,signature_html,signature_text,status,is_default",
            )
            .eq("id", input.mailboxId)
            .eq("organization_id", input.organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.client
        .from("organizations")
        .select("sending_settings")
        .eq("id", input.organizationId)
        .single(),
    ]);
    if (mailboxResult.error) throw new Error(mailboxResult.error.message);
    if (organizationResult.error) throw new Error(organizationResult.error.message);
    const mailbox = mailboxResult.data;
    if (isUuid(input.mailboxId) && !mailbox) throw new Error("MAILBOX_NOT_AVAILABLE");
    if (mailbox && mailbox.status !== "AVAILABLE") throw new Error("MAILBOX_NOT_AVAILABLE");
    const settings = (organizationResult.data.sending_settings ?? {}) as Record<string, unknown>;
    const footer = [
      input.postalAddress,
      typeof settings.unsubscribeText === "string" ? settings.unsubscribeText : "",
      typeof settings.unsubscribeUrl === "string" ? settings.unsubscribeUrl : "",
    ]
      .filter(Boolean)
      .join("\n");
    const data = unwrap(
      await this.client
        .from("outreach_drafts")
        .insert({
          organization_id: input.organizationId,
          campaign_id: input.campaignId,
          prospect_id: input.prospectId,
          recipient_email: input.recipientEmail.toLowerCase(),
          sending_mailbox_id: input.mailboxId,
          sending_provider: mailbox?.provider ?? "APOLLO",
          sender_email: mailbox?.email ?? "",
          sender_name: mailbox?.display_name ?? input.senderName,
          signature_html: mailbox?.signature_html ?? "",
          signature_text: mailbox?.signature_text || input.signatureText,
          compliance_footer_text: footer,
          subject: input.draft.subject,
          body: input.draft.body,
          personalization_summary: input.draft.personalizationSummary,
          selected_angle: input.draft.selectedAngle,
          qualification_summary: input.draft.qualificationSummary,
          supporting_claim_ids: input.draft.supportingClaimIds.filter(isUuid),
          confidence: normalizeConfidencePercent(input.draft.confidence),
          compliance_warnings: input.draft.complianceWarnings,
          status: "PENDING_USER_APPROVAL",
        })
        .select("id")
        .single(),
    ) as { id: string };
    return data;
  }
}

export async function claimAgentJobs(
  client: SupabaseClient,
  workerId: string,
  limit: number,
): Promise<AgentJob[]> {
  const { data, error } = await client.rpc("claim_agent_jobs", {
    p_worker_id: workerId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    campaignId: String(row.campaign_id),
    ...(row.run_id ? { runId: String(row.run_id) } : {}),
    type: row.job_type as AgentJob["type"],
    payload: (row.payload ?? {}) as Record<string, unknown>,
    attempts: Number(row.attempts),
  }));
}
