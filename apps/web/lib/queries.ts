import {
  demoActivity,
  demoCampaigns,
  demoDrafts,
  demoSendingSettings,
  demoSuppressions,
} from "./demo-data";
import { getAuthContext, isDemoMode } from "./auth";
import { readDiscoveryActivities } from "./discovery-activity";
import { createSupabaseServerClient } from "./supabase/server";

export async function getCampaigns() {
  if (isDemoMode()) return demoCampaigns;
  const auth = await getAuthContext();
  if (!auth) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("campaigns")
    .select(
      "id,name,objective,status,updated_at,prospects(status),outreach_drafts(id,status,draft_kind,created_at)",
    )
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
  return (data ?? [])
    .map((campaign, index) => {
      const prospects = campaign.prospects ?? [];
      const drafts = campaign.outreach_drafts ?? [];
      const pendingFollowUps = drafts
        .filter(
          (draft) => draft.draft_kind === "FOLLOW_UP" && draft.status === "PENDING_USER_APPROVAL",
        )
        .sort(
          (left, right) =>
            new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
        );
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
        followUpNeeded: pendingFollowUps.length,
        followUpDraftId: pendingFollowUps[0]?.id ?? null,
      };
    })
    .sort((left, right) => Number(right.followUpNeeded > 0) - Number(left.followUpNeeded > 0));
}

export async function getCampaign(id: string) {
  const campaigns = await getCampaigns();
  return campaigns.find((campaign) => campaign.id === id) ?? null;
}

export async function getCampaignApolloCreditBudget(id: string): Promise<number> {
  if (isDemoMode()) return 100;
  const auth = await getAuthContext();
  if (!auth) return 0;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("campaign_limits")
    .select("apollo_credit_budget")
    .eq("organization_id", auth.organizationId)
    .eq("campaign_id", id)
    .maybeSingle();
  return Number(data?.apollo_credit_budget ?? 0);
}

export async function getCampaignRunState(id: string) {
  if (isDemoMode())
    return {
      runStatus: "RUNNING",
      errorMessage: null,
      events: demoActivity.map((item, index) => ({
        sequence: index + 1,
        type: item.type.toUpperCase(),
        message: item.text,
        data: { detail: item.detail } as Record<string, unknown>,
        createdAt: new Date(Date.now() - index * 60_000).toISOString(),
      })),
    };
  const auth = await getAuthContext();
  if (!auth) return { runStatus: null, errorMessage: null, events: [] };
  const supabase = await createSupabaseServerClient();
  const { data: run } = await supabase
    .from("agent_runs")
    .select("id,status,error_message")
    .eq("organization_id", auth.organizationId)
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { runStatus: null, errorMessage: null, events: [] };
  const { data: events } = await supabase
    .from("agent_run_events")
    .select("sequence,event_type,public_message,data,created_at")
    .eq("organization_id", auth.organizationId)
    .eq("campaign_id", id)
    .eq("agent_run_id", run.id)
    .order("sequence", { ascending: false })
    .limit(12);
  return {
    runStatus: run.status as string,
    errorMessage: run.error_message as string | null,
    events: (events ?? [])
      .map((event) => ({
        sequence: Number(event.sequence),
        type: event.event_type,
        message: event.public_message,
        data:
          event.data && typeof event.data === "object"
            ? (event.data as Record<string, unknown>)
            : {},
        createdAt: event.created_at,
      }))
      .reverse(),
  };
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
      missingRequiredFields: [],
      unresolvedQuestions: [],
    };
  const auth = await getAuthContext();
  if (!auth)
    return {
      messages: [],
      readinessScore: 18,
      missingRequiredFields: [],
      unresolvedQuestions: [],
    };
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
    | {
        readinessScore?: unknown;
        missingRequiredFields?: unknown;
        unresolvedQuestions?: unknown;
      }
    | undefined;
  const savedScore = Number(latestStructured?.readinessScore);
  const missingRequiredFields = Array.isArray(latestStructured?.missingRequiredFields)
    ? latestStructured.missingRequiredFields.filter(
        (field): field is string => typeof field === "string",
      )
    : [];
  const unresolvedQuestions = Array.isArray(latestStructured?.unresolvedQuestions)
    ? latestStructured.unresolvedQuestions.filter(
        (question): question is string => typeof question === "string",
      )
    : [];
  const answerCount = rows.filter((row) => row.role === "user").length;
  const estimatedScore = Math.min(82, 18 + answerCount * 12);
  return {
    messages: rows.map((row) => {
      const structured =
        row.structured_data && typeof row.structured_data === "object"
          ? (row.structured_data as Record<string, unknown>)
          : null;
      const rowMissing = Array.isArray(structured?.missingRequiredFields)
        ? structured.missingRequiredFields.filter(
            (field): field is string => typeof field === "string",
          )
        : [];
      const rowScore = Number(structured?.readinessScore);
      const rowReadinessLabel = Number.isFinite(rowScore) ? `${rowScore}%` : "almost";
      const readinessMismatch =
        row.role === "assistant" &&
        structured?.ready === false &&
        rowMissing.length > 0 &&
        /profile complete|ready to build/i.test(row.content);
      const content = readinessMismatch
        ? rowMissing.includes("sender.postalAddress")
          ? `Your campaign profile is ${rowReadinessLabel} complete. Add a valid postal address in **Settings, then Sending**, then select **Recheck readiness** below.`
          : `Your campaign still has ${rowMissing.length} required item${rowMissing.length === 1 ? "" : "s"} before prospecting can start.`
        : row.content;
      const activity = readDiscoveryActivities(structured?.publicActivity).map((item) =>
        readinessMismatch && item.kind === "validation"
          ? {
              ...item,
              detail: `Readiness is ${rowReadinessLabel}. Required items still remaining: ${rowMissing.length}.`,
              status: "warning" as const,
            }
          : item,
      );
      return {
        role: row.role as "user" | "assistant",
        content,
        activity,
      };
    }),
    readinessScore:
      profileResult.data?.readiness_score ??
      (Number.isFinite(savedScore) ? savedScore : estimatedScore),
    missingRequiredFields,
    unresolvedQuestions,
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
      "id,campaign_id,prospect_id,recipient_email,sending_mailbox_id,sending_provider,sender_email,sender_name,signature_text,compliance_footer_text,subject,body,confidence,draft_kind,parent_email_send_id,follow_up_number,prospects(first_name,last_name,title,location,email_status,companies(name)),campaigns(name)",
    )
    .eq("organization_id", auth.organizationId)
    .eq("status", "PENDING_USER_APPROVAL")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return (data ?? [])
    .map((row) => {
      const prospect = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects;
      const company =
        prospect &&
        (Array.isArray(prospect.companies) ? prospect.companies[0] : prospect.companies);
      const name = `${prospect?.first_name ?? ""} ${prospect?.last_name ?? ""}`.trim();
      return {
        id: row.id,
        campaignId: row.campaign_id,
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
        draftKind: row.draft_kind as "INITIAL" | "FOLLOW_UP",
        followUpNumber: row.follow_up_number,
        parentEmailSendId: row.parent_email_send_id,
        selectionReason: "Qualified by campaign criteria",
        companySummary: "Research available in the campaign record.",
        signals: [],
        angle: "See saved draft angle",
        uncertainty: "",
        sources: [],
      };
    })
    .sort(
      (left, right) =>
        Number(right.draftKind === "FOLLOW_UP") - Number(left.draftKind === "FOLLOW_UP"),
    );
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
