import {
  AlertTriangle,
  Check,
  Clock3,
  FileCheck2,
  SearchCheck,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Progress } from "@marlow/ui";
import { CampaignChat } from "@/components/campaign-chat";
import { CampaignDeleteButton } from "@/components/campaign-delete-button";
import { CampaignLiveRefresh } from "@/components/campaign-live-refresh";
import { CampaignRetryButton } from "@/components/campaign-retry-button";
import { PageHeader } from "@/components/page-header";
import {
  campaignWorkflowSteps,
  formatCampaignStatus,
  formatActivityTime,
  getCampaignActivityLabel,
  getCampaignActivityTone,
  getCampaignProgress,
  getCampaignWorkflowStage,
} from "@/lib/campaign-progress";
import {
  getCampaign,
  getCampaignApolloCreditBudget,
  getCampaignDiscovery,
  getCampaignProfile,
  getCampaignProspects,
  getCampaignRunState,
  type CampaignProspectRow,
} from "@/lib/queries";
import type { CampaignProfile } from "@marlow/shared";

const prospectStatus: Record<
  CampaignProspectRow["status"],
  { label: string; tone: "success" | "warning" | "info" | "neutral" | "violet" }
> = {
  DRAFTED: { label: "Awaiting approval", tone: "warning" },
  SENT: { label: "Sent", tone: "success" },
  REPLIED: { label: "Replied", tone: "violet" },
  RESEARCHING: { label: "Researching", tone: "info" },
  QUALIFIED: { label: "Qualified", tone: "info" },
  SKIPPED: { label: "Skipped", tone: "neutral" },
};

function CampaignProfileCard({ profile }: { profile: CampaignProfile }) {
  const { targetAccount, targetPersonas, offer } = profile;
  const range = targetAccount.employeeRange;
  const groups = [
    {
      label: "Target accounts",
      items: [
        ...targetAccount.industries,
        ...(range?.min || range?.max
          ? [`${range.min ?? 1} to ${range.max ?? "any"} employees`]
          : []),
      ],
    },
    { label: "Personas", items: targetPersonas.flatMap((persona) => persona.titles) },
    { label: "Regions", items: targetAccount.locations },
    { label: "Buying signals", items: targetAccount.buyingSignals },
    { label: "Disqualifiers", items: profile.disqualifiers },
  ];
  return (
    <Card className="section-card icp-card">
      <div className="section-card__header">
        <h2>Ideal customer profile</h2>
        <span className="icp-card__meta">
          Built from discovery chat · {profile.limits.apolloCreditBudget} Apollo credit budget ·{" "}
          {profile.limits.dailySendLimit} sends per day
        </span>
      </div>
      <div className="icp-card__offer">
        <span>Offer</span>
        <p>
          <strong>{offer.productOrService}.</strong> {offer.primaryValue}. CTA: {offer.callToAction}
          .
        </p>
      </div>
      <div className="icp-card__grid">
        {groups.map((group) => (
          <div className="icp-card__group" key={group.label}>
            <span>{group.label}</span>
            <ul>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  if (["DISCOVERING", "READY"].includes(campaign.status)) {
    const discovery = await getCampaignDiscovery(id);
    const ready = campaign.status === "READY";
    const sendingSetupRequired = discovery.missingRequiredFields.some((field) =>
      ["sender.postalAddress", "sender.sendingMailboxId"].includes(field),
    );
    return (
      <div className="page page--narrow">
        <PageHeader
          title={
            ready
              ? "Campaign ready to start"
              : sendingSetupRequired
                ? "Complete sending setup"
                : "Continue campaign discovery"
          }
          description={
            ready
              ? "Review the completed profile, then start prospecting when you are ready."
              : sendingSetupRequired
                ? "Finish the required sender details, then recheck readiness and start prospecting."
                : "Pick up where you left off. Your saved answers are already here."
          }
          actions={<CampaignDeleteButton campaignId={id} campaignName={campaign.name} />}
        />
        <CampaignChat
          initialCampaignId={id}
          initialMessages={discovery.messages}
          initialProgress={discovery.readinessScore}
          initialReady={ready}
          initialMissingRequiredFields={discovery.missingRequiredFields}
        />
      </div>
    );
  }
  const [prospects, profile, runState, apolloCreditBudget] = await Promise.all([
    getCampaignProspects(id),
    getCampaignProfile(id),
    getCampaignRunState(id),
    getCampaignApolloCreditBudget(id),
  ]);
  const awaitingApproval = prospects.filter((prospect) => prospect.status === "DRAFTED").length;
  const workflowStage = getCampaignWorkflowStage(campaign.status, runState.events);
  const progress = getCampaignProgress(campaign.status, runState.events);
  const activityLabel = getCampaignActivityLabel(campaign.status, runState.runStatus);
  const activityTone = getCampaignActivityTone(campaign.status, runState.runStatus);
  const campaignActive = ![
    "PAUSED",
    "FAILED",
    "PENDING_USER_APPROVAL",
    "SENT",
    "COMPLETED",
  ].includes(campaign.status);
  const visibleEvents = [...runState.events].reverse();
  return (
    <div className="page">
      <CampaignLiveRefresh campaignId={id} active={campaignActive} />
      {campaign.followUpNeeded > 0 ? (
        <div className="status-banner status-banner--warning">
          <Clock3 size={14} />
          Follow-up needed. No reply was detected after 7 days, and a draft is ready for your
          approval.
        </div>
      ) : null}
      <Card className="campaign-hero">
        <div className="campaign-hero__top">
          <div>
            <Badge
              tone={
                campaign.followUpNeeded > 0 || campaign.status === "FAILED"
                  ? "warning"
                  : campaign.status === "PAUSED"
                    ? "neutral"
                    : "success"
              }
            >
              {campaign.followUpNeeded > 0
                ? "Follow-up needed"
                : formatCampaignStatus(campaign.status)}
            </Badge>
            <h1>{campaign.name}</h1>
            <p>{campaign.objective}</p>
          </div>
          <div className="page-header__actions">
            <CampaignDeleteButton campaignId={id} campaignName={campaign.name} />
            {campaign.status === "FAILED" ? (
              <CampaignRetryButton campaignId={id} apolloCreditBudget={apolloCreditBudget} />
            ) : null}
            <Link
              className="button button--primary button--md"
              href={campaign.followUpDraftId ? `/review/${campaign.followUpDraftId}` : "/review"}
            >
              <FileCheck2 size={14} />
              {campaign.followUpNeeded > 0 ? "Review follow-up" : `Review ${campaign.drafts}`}
            </Link>
          </div>
        </div>
        <div className="campaign-hero__progress">
          <Progress value={progress} label="Campaign workflow progress" />
          <span>{progress}% complete</span>
        </div>
        <div className="workflow">
          {campaignWorkflowSteps.map((step, index) => (
            <div
              className={`workflow-step ${workflowStage >= campaignWorkflowSteps.length || index < workflowStage ? "workflow-step--done" : index === workflowStage && campaign.status !== "FAILED" && campaign.status !== "PAUSED" ? "workflow-step--active" : ""}`}
              key={step}
            >
              <span className="workflow-step__node">
                {workflowStage >= campaignWorkflowSteps.length || index < workflowStage ? (
                  <Check size={13} />
                ) : (
                  index + 1
                )}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </Card>
      {profile ? <CampaignProfileCard profile={profile} /> : null}
      <div className="campaign-detail-grid">
        <Card className="section-card">
          <div className="section-card__header">
            <h2>
              Prospects <span className="section-card__count">{prospects.length}</span>
            </h2>
            <Link href="/review">
              {awaitingApproval > 0 ? `${awaitingApproval} awaiting approval` : "Open review queue"}
            </Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="prospect-table">
              <thead>
                <tr>
                  <th>Prospect</th>
                  <th>Company</th>
                  <th>Fit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((prospect) => {
                  const status = prospectStatus[prospect.status];
                  const person = (
                    <>
                      <span className="avatar avatar--teal">{prospect.initials}</span>
                      <span>
                        <strong>{prospect.name}</strong>
                        <span>{prospect.title}</span>
                      </span>
                    </>
                  );
                  return (
                    <tr
                      className={prospect.status === "SKIPPED" ? "prospect-row--muted" : undefined}
                      key={prospect.id}
                    >
                      <td>
                        {prospect.draftId ? (
                          <Link className="prospect-cell" href={`/review/${prospect.draftId}`}>
                            {person}
                          </Link>
                        ) : (
                          <span className="prospect-cell">{person}</span>
                        )}
                      </td>
                      <td>
                        <span className="prospect-company">
                          <strong>{prospect.company}</strong>
                          <span>{prospect.location}</span>
                        </span>
                      </td>
                      <td>
                        <span className="score">{prospect.score}</span>
                      </td>
                      <td>
                        <span className="prospect-status">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span>{prospect.note}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {prospects.length === 0 ? (
                  <tr>
                    <td className="prospect-table__empty" colSpan={4}>
                      {campaign.status === "FAILED"
                        ? "Prospecting stopped before a review draft was created."
                        : "Qualified prospects will appear here as Marlow prepares review drafts."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="section-card">
          <div className="section-card__header">
            <h2>Live agent activity</h2>
            <Badge tone={activityTone}>{activityLabel}</Badge>
          </div>
          <div className="activity-list">
            {visibleEvents.map((event) => {
              const message = event.message.toLowerCase();
              const draftReady = event.type === "DRAFT_READY" || message.includes("approval");
              const failed = event.type === "RUN_STATUS" && message.includes("failed");
              const detail =
                typeof event.data.detail === "string"
                  ? event.data.detail
                  : typeof event.data.progress === "string"
                    ? event.data.progress
                    : event.type.replaceAll("_", " ").toLowerCase();
              return (
                <div className="activity-item" key={event.sequence}>
                  <span
                    className={`activity-icon ${failed ? "activity-icon--skipped" : draftReady ? "activity-icon--sent" : message.includes("research") ? "activity-icon--research" : ""}`}
                  >
                    {failed ? (
                      <AlertTriangle size={14} />
                    ) : draftReady ? (
                      <Send size={14} />
                    ) : message.includes("research") ? (
                      <SearchCheck size={14} />
                    ) : (
                      <Sparkles size={14} />
                    )}
                  </span>
                  <div className="activity-item__body">
                    <strong>{event.message}</strong>
                    <span>{detail}</span>
                  </div>
                  <time>{formatActivityTime(event.createdAt)}</time>
                </div>
              );
            })}
            {visibleEvents.length === 0 ? (
              <div className="activity-empty" role="status">
                <Clock3 size={17} />
                <div>
                  <strong>
                    {campaign.status === "QUEUED"
                      ? "Waiting for a worker"
                      : campaign.status === "FAILED"
                        ? "Campaign needs attention"
                        : "No activity recorded yet"}
                  </strong>
                  <span>
                    {campaign.status === "QUEUED"
                      ? "The campaign is safely queued. This panel updates when processing starts."
                      : (runState.errorMessage ?? "New activity will appear here automatically.")}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
