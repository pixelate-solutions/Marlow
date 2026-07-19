import { CheckCircle2, Clock3, FileCheck2, SearchCheck, Send, Target } from "lucide-react";
import Link from "next/link";
import { Badge, Card, Progress } from "@marlow/ui";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getDashboard } from "@/lib/queries";

export const metadata = { title: "Dashboard" };

function statusTone(status: string): "success" | "info" | "warning" | "neutral" {
  if (status === "PENDING_USER_APPROVAL") return "success";
  if (status === "RESEARCHING") return "info";
  if (status === "PAUSED") return "warning";
  return "neutral";
}

export default async function DashboardPage() {
  const { metrics, campaigns, activity } = await getDashboard();
  return (
    <div className="page">
      <PageHeader
        title="Outbound workspace"
        description={`${metrics.activeCampaigns} active campaign${metrics.activeCampaigns === 1 ? "" : "s"}. ${metrics.awaitingApproval} draft${metrics.awaitingApproval === 1 ? "" : "s"} ready for review.`}
        actions={
          <Link className="button button--secondary button--md" href="/review">
            <FileCheck2 size={15} />
            Review drafts
          </Link>
        }
      />
      <div className="metrics-grid">
        <MetricCard
          label="Active campaigns"
          value={metrics.activeCampaigns}
          trend="Current workflow state"
          icon={Target}
        />
        <MetricCard
          label="Leads being researched"
          value={metrics.researching}
          trend="Qualified or researched"
          icon={SearchCheck}
          tone="blue"
        />
        <MetricCard
          label="Awaiting approval"
          value={metrics.awaitingApproval}
          trend="Human review required"
          icon={FileCheck2}
          tone="amber"
        />
        <MetricCard
          label="Emails sent"
          value={metrics.sent}
          trend="Confirmed sends only"
          icon={Send}
          tone="violet"
        />
      </div>
      <div className="dashboard-grid">
        <Card className="section-card">
          <div className="section-card__header">
            <h2>Campaigns in motion</h2>
            <Link href="/campaigns">View all</Link>
          </div>
          {campaigns.map((campaign) => (
            <Link className="campaign-row" href={`/campaigns/${campaign.id}`} key={campaign.id}>
              <div className="campaign-row__name">
                <span className={`campaign-dot campaign-dot--${campaign.color}`} />
                <div>
                  <strong>{campaign.name}</strong>
                  <span>{campaign.updated}</span>
                </div>
              </div>
              <div className="campaign-stat">
                <strong>{campaign.prospects}</strong>
                <span>Found</span>
              </div>
              <div className="campaign-stat">
                <strong>{campaign.qualified}</strong>
                <span>Qualified</span>
              </div>
              <div className="campaign-stat">
                <strong>{campaign.drafts}</strong>
                <span>Drafts</span>
              </div>
              <div className="campaign-progress">
                <div className="campaign-progress__top">
                  <span>{campaign.progress}%</span>
                  <Badge tone={statusTone(campaign.status)}>
                    {campaign.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <Progress value={campaign.progress} />
              </div>
            </Link>
          ))}
        </Card>
        <Card className="section-card">
          <div className="section-card__header">
            <h2>Agent activity</h2>
            <span className="badge badge--success">Live</span>
          </div>
          <div className="activity-list">
            {activity.map((item) => {
              const Icon =
                item.type === "sent"
                  ? CheckCircle2
                  : item.type === "research"
                    ? SearchCheck
                    : item.type === "skipped"
                      ? Clock3
                      : item.type === "qualified"
                        ? Target
                        : FileCheck2;
              return (
                <div className="activity-item" key={item.id}>
                  <span className={`activity-icon activity-icon--${item.type}`}>
                    <Icon size={14} />
                  </span>
                  <div className="activity-item__body">
                    <strong>{item.text}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <time>{item.time}</time>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <Card className="usage-card">
        <div className="usage-card__header">
          <h2>Today’s guardrails</h2>
          <Badge tone="neutral">Conservative usage counts</Badge>
        </div>
        <div className="usage-grid">
          <div className="usage-item">
            <div className="usage-item__top">
              <strong>
                {metrics.dailyUsed} <small>/ {metrics.dailyLimit}</small>
              </strong>
              <span>Emails sent</span>
            </div>
            <Progress
              value={(metrics.dailyUsed / metrics.dailyLimit) * 100}
              label="Daily sending usage"
            />
          </div>
          <div className="usage-item">
            <div className="usage-item__top">
              <strong>
                {metrics.creditsUsed} <small>/ 100</small>
              </strong>
              <span>Apollo credits</span>
            </div>
            <Progress value={metrics.creditsUsed} label="Apollo credit usage" />
          </div>
        </div>
      </Card>
    </div>
  );
}
