import { CheckCircle2, Globe2, Orbit, Send } from "lucide-react";
import { Badge, Card } from "@marlow/ui";
import { ApolloConnection } from "@/components/apollo-connection";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Integrations"
        description="Connect the systems Marlow can use. Send authority always stays behind your approval."
      />
      <div className="integration-grid">
        <Card className="integration-card">
          <div className="integration-card__top">
            <span className="integration-logo">
              <Send size={20} />
            </span>
            <Badge tone="success">Demo connected</Badge>
          </div>
          <h2>Apollo</h2>
          <p>
            Search companies and people, enrich qualified contacts, and send one-off emails through
            Apollo’s official remote MCP server.
          </p>
          <div className="integration-details">
            <div className="integration-detail">
              <span>Transport</span>
              <strong>OAuth 2.0 · Streamable HTTP</strong>
            </div>
            <div className="integration-detail">
              <span>Sending mailbox</span>
              <strong>alex@northstar.example</strong>
            </div>
            <div className="integration-detail">
              <span>Credit usage</span>
              <strong>42 / 100</strong>
            </div>
          </div>
          <ApolloConnection connected />
        </Card>
        <Card className="integration-card">
          <div className="integration-card__top">
            <span className="integration-logo integration-logo--meta">
              <Orbit size={20} />
            </span>
            <Badge tone="success">Configured</Badge>
          </div>
          <h2>Meta Muse Spark</h2>
          <p>
            Muse Spark 1.1 handles discovery, planning, qualification, research synthesis, drafting,
            and review. No silent fallback is configured.
          </p>
          <div className="integration-details">
            <div className="integration-detail">
              <span>Model</span>
              <strong>muse-spark-1.1</strong>
            </div>
            <div className="integration-detail">
              <span>Provider</span>
              <strong>Meta Model API</strong>
            </div>
            <div className="integration-detail">
              <span>Fallback</span>
              <strong>Disabled</strong>
            </div>
          </div>
          <button className="button button--secondary button--md" type="button" disabled>
            <CheckCircle2 size={14} />
            Server configured
          </button>
        </Card>
        <Card className="integration-card">
          <div className="integration-card__top">
            <span className="integration-logo integration-logo--web">
              <Globe2 size={20} />
            </span>
            <Badge tone="info">Grounded</Badge>
          </div>
          <h2>Public web research</h2>
          <p>
            Search-grounded answers and safe public-page retrieval provide citations for account
            signals and email personalization.
          </p>
          <div className="integration-details">
            <div className="integration-detail">
              <span>Private networks</span>
              <strong>Blocked</strong>
            </div>
            <div className="integration-detail">
              <span>Prompt injection</span>
              <strong>Untrusted-content boundary</strong>
            </div>
            <div className="integration-detail">
              <span>Browser use</span>
              <strong>Public pages only</strong>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
