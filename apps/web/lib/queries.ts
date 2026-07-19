import {
  demoActivity,
  demoCampaigns,
  demoDrafts,
  demoSendingSettings,
  demoSuppressions,
} from "./demo-data";
import { getAuthContext, isDemoMode } from "./auth";
import { createSupabaseServerClient } from "./supabase/server";

export async function getCampaigns() {
  if (isDemoMode()) return demoCampaigns;
  const auth = await getAuthContext();
  if (!auth) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id,name,objective,status,updated_at,prospects(status),outreach_drafts(status)")
    .eq("organization_id", auth.organizationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const stageProgress: Record<string, number> = {
    DRAFT: 5,
    DISCOVERING: 10,
    READY: 15,
    QUEUED: 20,
    SEARCHING_ACCOUNTS: 30,
    QUALIFYING_ACCOUNTS: 40,
    SEARCHING_PEOPLE: 48,
    ENRICHING: 56,
    RESEARCHING: 64,
    SCORING: 72,
    WRITING: 80,
    QUALITY_REVIEW: 86,
    PENDING_USER_APPROVAL: 90,
    APPROVED: 93,
    SENDING: 96,
    SENT: 100,
    COMPLETED: 100,
    PAUSED: 50,
    FAILED: 50,
  };
  return (data ?? []).map((campaign, index) => {
    const prospects = campaign.prospects ?? [];
    const drafts = campaign.outreach_drafts ?? [];
    return {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      progress: stageProgress[campaign.status] ?? 0,
      prospects: prospects.length,
      qualified: prospects.filter((prospect) =>
        ["QUALIFIED", "RESEARCHED", "DRAFTED", "SENT"].includes(prospect.status),
      ).length,
      drafts: drafts.length,
      sent: drafts.filter((draft) => draft.status === "SENT").length,
      updated: new Date(campaign.updated_at).toLocaleDateString(),
      color: (["teal", "blue", "amber"] as const)[index % 3] ?? "teal",
    };
  });
}

export async function getCampaign(id: string) {
  const campaigns = await getCampaigns();
  return campaigns.find((campaign) => campaign.id === id) ?? null;
}

export async function getCampaignDiscovery(id: string) {
  if (isDemoMode())
    return {
      messages: [
        {
          role: "assistant" as const,
          content: "Tell me about your company, what you sell, and who you’re trying to reach.",
        },
      ],
      readinessScore: 18,
    };
  const auth = await getAuthContext();
  if (!auth) return { messages: [], readinessScore: 18 };
  const supabase = await createSupabaseServerClient();
  const [messageResult, profileResult] = await Promise.all([
    supabase
      .from("campaign_messages")
      .select("role,content,structured_data")
      .eq("organization_id", auth.organizationId)
      .eq("campaign_id", id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("campaign_profiles")
      .select("readiness_score")
      .eq("organization_id", auth.organizationId)
      .eq("campaign_id", id)
      .eq("is_current", true)
      .maybeSingle(),
  ]);
  const rows = messageResult.data ?? [];
  const latestStructured = [...rows]
    .reverse()
    .map((row) => row.structured_data)
    .find((value) => value && typeof value === "object") as
    { readinessScore?: unknown } | undefined;
  const savedScore = Number(latestStructured?.readinessScore);
  const answerCount = rows.filter((row) => row.role === "user").length;
  const estimatedScore = Math.min(82, 18 + answerCount * 12);
  return {
    messages: rows.map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    })),
    readinessScore:
      profileResult.data?.readiness_score ??
      (Number.isFinite(savedScore) ? savedScore : estimatedScore),
  };
}

export async function getDrafts() {
  if (isDemoMode()) return demoDrafts;
  const auth = await getAuthContext();
  if (!auth) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("outreach_drafts")
    .select(
      "id,prospect_id,recipient_email,sending_mailbox_id,sending_provider,sender_email,sender_name,signature_text,compliance_footer_text,subject,body,confidence,prospects(first_name,last_name,title,location,email_status,companies(name)),campaigns(name)",
    )
    .eq("organization_id", auth.organizationId)
    .eq("status", "PENDING_USER_APPROVAL")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => {
    const prospect = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects;
    const company =
      prospect && (Array.isArray(prospect.companies) ? prospect.companies[0] : prospect.companies);
    const name = `${prospect?.first_name ?? ""} ${prospect?.last_name ?? ""}`.trim();
    return {
      id: row.id,
      prospectId: row.prospect_id,
      name,
      initials: name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2),
      title: prospect?.title ?? "",
      company: company?.name ?? "",
      location: prospect?.location ?? "",
      email: row.recipient_email,
      emailStatus: prospect?.email_status ?? "Unknown",
      score: row.confidence,
      subject: row.subject,
      body: row.body,
      signature: row.signature_text,
      complianceFooter: row.compliance_footer_text,
      postalAddress: row.compliance_footer_text,
      mailboxId: row.sending_mailbox_id,
      mailbox:
        row.sender_email && row.sender_name
          ? `${row.sender_name} <${row.sender_email}>`
          : row.sender_email || row.sending_mailbox_id,
      sendingProvider: row.sending_provider,
      selectionReason: "Qualified by campaign criteria",
      companySummary: "Research available in the campaign record.",
      signals: [],
      angle: "See saved draft angle",
      uncertainty: "",
      sources: [],
    };
  });
}

export async function getDraft(id: string) {
  const drafts = await getDrafts();
  return drafts.find((draft) => draft.id === id) ?? null;
}

export async function getDashboard() {
  const campaigns = await getCampaigns();
  const drafts = await getDrafts();
  if (isDemoMode())
    return {
      campaigns,
      drafts,
      activity: demoActivity,
      metrics: {
        activeCampaigns: campaigns.filter((item) => !["PAUSED", "COMPLETED"].includes(item.status))
          .length,
        researching: campaigns.reduce((sum, item) => sum + item.qualified, 0),
        awaitingApproval: drafts.length,
        sent: campaigns.reduce((sum, item) => sum + item.sent, 0),
        skipped: 14,
        creditsUsed: 42,
        dailyUsed: 18,
        dailyLimit: 25,
      },
    };
  const auth = await getAuthContext();
  if (!auth)
    return {
      campaigns,
      drafts,
      activity: [],
      metrics: {
        activeCampaigns: 0,
        researching: 0,
        awaitingApproval: 0,
        sent: 0,
        skipped: 0,
        creditsUsed: 0,
        dailyUsed: 0,
        dailyLimit: 25,
      },
    };
  const supabase = await createSupabaseServerClient();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [prospectResult, creditResult, activityResult, dailySendResult, settings] =
    await Promise.all([
      supabase
        .from("prospects")
        .select("status")
        .eq("organization_id", auth.organizationId)
        .is("deleted_at", null),
      supabase
        .from("apollo_credit_usage")
        .select("actual_credits")
        .eq("organization_id", auth.organizationId)
        .gte("created_at", dayStart.toISOString()),
      supabase
        .from("audit_events")
        .select("id,action,created_at")
        .eq("organization_id", auth.organizationId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("audit_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", auth.organizationId)
        .eq("action", "EMAIL_SENT")
        .gte("created_at", dayStart.toISOString()),
      getSendingSettings(),
    ]);
  const prospects = prospectResult.data ?? [];
  const activity = (activityResult.data ?? []).map((entry) => ({
    id: entry.id,
    type: entry.action.includes("SENT")
      ? "sent"
      : entry.action.includes("SUPPRESS") || entry.action.includes("SKIP")
        ? "skipped"
        : entry.action.includes("DRAFT")
          ? "draft"
          : "research",
    text: String(entry.action)
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (letter: string) => letter.toUpperCase()),
    detail: "Recorded in the immutable audit trail",
    time: new Date(entry.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  }));
  return {
    campaigns,
    drafts,
    activity,
    metrics: {
      activeCampaigns: campaigns.filter(
        (item) => !["DRAFT", "PAUSED", "FAILED", "COMPLETED"].includes(item.status),
      ).length,
      researching: prospects.filter((prospect) =>
        ["QUALIFIED", "RESEARCHED"].includes(prospect.status),
      ).length,
      awaitingApproval: drafts.length,
      sent: prospects.filter((prospect) => prospect.status === "SENT").length,
      skipped: prospects.filter((prospect) => prospect.status === "SKIPPED").length,
      creditsUsed: (creditResult.data ?? []).reduce(
        (total, row) => total + Number(row.actual_credits),
        0,
      ),
      dailyUsed: dailySendResult.count ?? 0,
      dailyLimit: settings.dailyLimit,
    },
  };
}

export async function getSendingSettings() {
  if (isDemoMode()) return demoSendingSettings;
  const auth = await getAuthContext();
  const defaults = {
    ...demoSendingSettings,
    senderName: "",
    senderTitle: "",
    postalAddress: "",
    unsubscribeUrl: "",
  };
  if (!auth) return defaults;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("sending_settings")
    .eq("id", auth.organizationId)
    .single();
  return {
    ...defaults,
    ...((data?.sending_settings as Partial<typeof demoSendingSettings> | null) ?? {}),
  };
}

export async function getSuppressions() {
  if (isDemoMode()) return demoSuppressions;
  const auth = await getAuthContext();
  if (!auth) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("suppression_entries")
    .select("id,suppression_type,normalized_value,reason,source,created_at")
    .eq("organization_id", auth.organizationId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((entry) => ({
    id: entry.id,
    type: entry.suppression_type,
    value: String(entry.normalized_value),
    reason: entry.reason ?? "No reason provided",
    source: entry.source,
    createdAt: new Date(entry.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  }));
}

export async function getWorkspaceSettings() {
  if (isDemoMode()) return { name: "Northstar", slug: "northstar" };
  const auth = await getAuthContext();
  if (!auth) return { name: "", slug: "" };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("name,slug")
    .eq("id", auth.organizationId)
    .single();
  return data ?? { name: "", slug: "" };
}

export async function getProfileSettings() {
  const auth = await getAuthContext();
  if (!auth) return { fullName: "", jobTitle: "", email: "" };
  if (auth.demo) return { fullName: "Alex Morgan", jobTitle: "Founder", email: auth.email };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("full_name,job_title")
    .eq("organization_id", auth.organizationId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  return { fullName: data?.full_name ?? "", jobTitle: data?.job_title ?? "", email: auth.email };
}
