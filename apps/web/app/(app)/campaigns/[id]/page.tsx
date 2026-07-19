import { Check, FileCheck2, Pause, SearchCheck, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Progress } from "@marlow/ui";
import { CampaignChat } from "@/components/campaign-chat";
import { PageHeader } from "@/components/page-header";
import { getCampaign, getCampaignDiscovery, getDrafts } from "@/lib/queries";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  if (["DISCOVERING", "READY"].includes(campaign.status)) {
    const discovery = await getCampaignDiscovery(id);
    const ready = campaign.status === "READY";
    return (
      <div className="page page--narrow">
        <PageHeader
          title={ready ? "Campaign ready to start" : "Continue campaign discovery"}
          description={
            ready
              ? "Review the completed profile, then start prospecting when you are ready."
              : "Pick up where you left off. Your saved answers are already here."
          }
        />
        <CampaignChat
          initialCampaignId={id}
          initialMessages={discovery.messages}
          initialProgress={discovery.readinessScore}
          initialReady={ready}
        />
      </div>
    );
  }
  const drafts = await getDrafts();
  const steps = ["Search", "Qualify", "Enrich", "Research", "Write", "Review"];
  return (
    <div className="page">
      <Card className="campaign-hero">
        <div className="campaign-hero__top">
          <div>
            <Badge tone="success">{campaign.status.replaceAll("_", " ")}</Badge>
            <h1>{campaign.name}</h1>
            <p>{campaign.objective}</p>
          </div>
          <div className="page-header__actions">
            <button className="button button--secondary button--md" type="button">
              <Pause size={14} />
              Pause
            </button>
            <Link className="button button--primary button--md" href="/review">
              <FileCheck2 size={14} />
              Review {campaign.drafts}
            </Link>
          </div>
        </div>
        <div className="campaign-hero__progress">
          <Progress value={campaign.progress} label="Campaign workflow progress" />
          <span>{campaign.progress}% complete</span>
        </div>
        <div className="workflow">
          {steps.map((step, index) => (
            <div
              className={`workflow-step ${index < 4 ? "workflow-step--done" : index === 4 ? "workflow-step--active" : ""}`}
              key={step}
            >
              <span className="workflow-step__node">
                {index < 4 ? <Check size={13} /> : index + 1}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="campaign-detail-grid">
        <Card className="section-card">
          <div className="section-card__header">
            <h2>Qualified prospects</h2>
            <Link href="/review">Open review queue</Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="prospect-table">
              <thead>
                <tr>
                  <th>Prospect</th>
                  <th>Company</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>
                      <Link className="prospect-cell" href={`/review/${draft.id}`}>
                        <span className="avatar avatar--teal">{draft.initials}</span>
                        <span>
                          <strong>{draft.name}</strong>
                          <span>{draft.title}</span>
                        </span>
                      </Link>
                    </td>
                    <td>{draft.company}</td>
                    <td>
                      <span className="score">{draft.score}</span>
                    </td>
                    <td>
                      <Badge tone="success">Ready for review</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="section-card">
          <div className="section-card__header">
            <h2>Live agent activity</h2>
            <Badge tone="info">Working</Badge>
          </div>
          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-icon activity-icon--research">
                <SearchCheck size={14} />
              </span>
              <div className="activity-item__body">
                <strong>Researching Brightline Logistics</strong>
                <span>Checking official press releases</span>
              </div>
              <time>Now</time>
            </div>
            <div className="activity-item">
              <span className="activity-icon">
                <Sparkles size={14} />
              </span>
              <div className="activity-item__body">
                <strong>Scored Maya Chen at 92</strong>
                <span>Strong persona and signal match</span>
              </div>
              <time>4m</time>
            </div>
            <div className="activity-item">
              <span className="activity-icon activity-icon--sent">
                <Send size={14} />
              </span>
              <div className="activity-item__body">
                <strong>Draft ready for review</strong>
                <span>Acme Automation</span>
              </div>
              <time>8m</time>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
