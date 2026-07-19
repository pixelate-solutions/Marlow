import type {
  CampaignProfile,
  CampaignStatus,
  LeadScoreComponents,
  OutreachDraft,
  ResearchClaim,
} from "@marlow/shared";

export type CampaignRecord = {
  id: string;
  organizationId: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  minimumLeadScore: number;
  profile: CampaignProfile;
};

export type CompanyInput = {
  organizationId: string;
  campaignId: string;
  apolloId?: string;
  name: string;
  domain: string;
  websiteUrl?: string;
  industry?: string;
  employeeCount?: number;
  location?: string;
  rawData?: Record<string, unknown>;
};

export type ProspectInput = {
  organizationId: string;
  campaignId: string;
  companyId: string;
  apolloPersonId?: string;
  apolloContactId?: string;
  firstName: string;
  lastName: string;
  title: string;
  email?: string;
  emailStatus?: string;
  linkedinUrl?: string;
  location?: string;
  selectionReason?: string;
  rawData?: Record<string, unknown>;
};

export type AgentJob = {
  id: string;
  organizationId: string;
  campaignId: string;
  runId?: string;
  type: "CAMPAIGN_RUN" | "SEND_EMAIL";
  payload: Record<string, unknown>;
  attempts: number;
};

export interface AgentRepository {
  getCampaign(campaignId: string): Promise<CampaignRecord>;
  transitionCampaign(campaignId: string, from: CampaignStatus[], to: CampaignStatus): Promise<void>;
  appendRunEvent(input: {
    runId: string;
    organizationId: string;
    campaignId: string;
    type: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
  saveCompany(input: CompanyInput): Promise<{ id: string }>;
  saveProspect(input: ProspectInput): Promise<{ id: string; duplicate: boolean }>;
  isSuppressed(input: {
    organizationId: string;
    email?: string;
    domain?: string;
    apolloPersonId?: string;
    apolloContactId?: string;
  }): Promise<boolean>;
  saveResearch(input: {
    organizationId: string;
    campaignId: string;
    prospectId: string;
    companySummary: string;
    signals: string[];
    claims: ResearchClaim[];
  }): Promise<{ claimIds: string[] }>;
  saveLeadScore(input: {
    organizationId: string;
    campaignId: string;
    prospectId: string;
    total: number;
    components: LeadScoreComponents;
    explanation: string;
  }): Promise<void>;
  saveDraft(input: {
    organizationId: string;
    campaignId: string;
    prospectId: string;
    recipientEmail: string;
    mailboxId: string;
    draft: OutreachDraft;
  }): Promise<{ id: string }>;
}
