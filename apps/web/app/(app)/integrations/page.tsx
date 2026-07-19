import { AtSign, CheckCircle2, Globe2, Mail, Orbit, Send } from "lucide-react";
import { Badge, Card } from "@marlow/ui";
import { ApolloConnection } from "@/components/apollo-connection";
import { EmailConnection } from "@/components/email-connection";
import { PageHeader } from "@/components/page-header";
import { getAuthContext, isDemoMode } from "@/lib/auth";
import { getSendingMailboxes, mailboxOAuthConfig } from "@/lib/mailboxes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const auth = await getAuthContext();
  const params = await searchParams;
  const integrations = new Map<string, string>();
  let mailboxes = [] as Awaited<ReturnType<typeof getSendingMailboxes>>;
  if (auth && !isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("integrations")
      .select("provider,status")
      .eq("organization_id", auth.organizationId)
      .in("provider", ["APOLLO", "GMAIL", "MICROSOFT"]);
    for (const integration of data ?? [])
      integrations.set(integration.provider, integration.status);
    mailboxes = await getSendingMailboxes(auth.organizationId);
  }
  const demo = isDemoMode();
  if (demo)
    mailboxes = [
      {
        id: "demo-google-mailbox",
        provider: "GMAIL",
        email: "alex@northstar.example",
        displayName: "Alex Morgan",
        replyTo: "",
        signatureHtml: "<strong>Alex Morgan</strong><br>Founder, Northstar",
        signatureText: "Alex Morgan\nFounder, Northstar",
        signatureSource: "PROVIDER",
        isDefault: true,
        isPrimary: true,
        status: "AVAILABLE",
        lastSyncedAt: new Date().toISOString(),
      },
      {
        id: "demo-microsoft-mailbox",
        provider: "MICROSOFT",
        email: "alex@northstar.example",
        displayName: "Alex Morgan",
        replyTo: "",
        signatureHtml: "<strong>Alex Morgan</strong><br>Founder, Northstar",
        signatureText: "Alex Morgan\nFounder, Northstar",
        signatureSource: "MANUAL",
        isDefault: false,
        isPrimary: true,
        status: "AVAILABLE",
        lastSyncedAt: new Date().toISOString(),
      },
    ];
  const googleConfig = mailboxOAuthConfig("GMAIL");
  const microsoftConfig = mailboxOAuthConfig("MICROSOFT");
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Integrations"
        description="Connect the systems Marlow can use. Send authority always stays behind your approval."
      />
      {params.connected ? (
        <div className="status-banner" role="status">
          {params.connected === "google" ? "Google" : "Microsoft"} mailbox connected.
        </div>
      ) : null}
      {params.error ? (
        <div className="status-banner status-banner--warning" role="alert">
          {params.error}
        </div>
      ) : null}
      <div className="integration-grid">
        <Card className="integration-card">
          <div className="integration-card__top">
            <span className="integration-logo">
              <Send size={20} />
            </span>
            <Badge
              tone={integrations.get("APOLLO") === "CONNECTED" || demo ? "success" : "warning"}
            >
              {integrations.get("APOLLO") === "CONNECTED" || demo ? "Connected" : "Not connected"}
            </Badge>
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
              <span>Primary use</span>
              <strong>Prospecting and enrichment</strong>
            </div>
            <div className="integration-detail">
              <span>Email transport</span>
              <strong>Available for legacy campaigns</strong>
            </div>
          </div>
          <ApolloConnection connected={integrations.get("APOLLO") === "CONNECTED" || demo} />
        </Card>
        <Card className="integration-card integration-card--wide">
          <div className="integration-card__top">
            <span className="integration-logo integration-logo--google">
              <Mail size={20} />
            </span>
            <Badge tone={integrations.get("GMAIL") === "CONNECTED" || demo ? "success" : "info"}>
              {integrations.get("GMAIL") === "CONNECTED" || demo ? "Connected" : "Available"}
            </Badge>
          </div>
          <h2>Gmail and Google Workspace</h2>
          <p>
            Send from your verified Gmail address through the Gmail API. Marlow imports the
            signature assigned to each Gmail send-as address.
          </p>
          <div className="integration-details">
            <div className="integration-detail">
              <span>Sending identity</span>
              <strong>Connected Google mailbox</strong>
            </div>
            <div className="integration-detail">
              <span>Signature</span>
              <strong>Automatic Gmail sync</strong>
            </div>
            <div className="integration-detail">
              <span>Approval</span>
              <strong>Required before every send</strong>
            </div>
          </div>
          <EmailConnection
            provider="google"
            configured={demo || googleConfig.configured}
            status={demo ? "CONNECTED" : (integrations.get("GMAIL") ?? "DISCONNECTED")}
            mailboxes={mailboxes.filter((mailbox) => mailbox.provider === "GMAIL")}
          />
        </Card>
        <Card className="integration-card integration-card--wide">
          <div className="integration-card__top">
            <span className="integration-logo integration-logo--microsoft">
              <AtSign size={20} />
            </span>
            <Badge
              tone={integrations.get("MICROSOFT") === "CONNECTED" || demo ? "success" : "info"}
            >
              {integrations.get("MICROSOFT") === "CONNECTED" || demo ? "Connected" : "Available"}
            </Badge>
          </div>
          <h2>Microsoft 365 and Outlook</h2>
          <p>
            Send through Microsoft Graph from the exact Outlook or Microsoft 365 account that grants
            access. Sent messages are saved in that mailbox.
          </p>
          <div className="integration-details">
            <div className="integration-detail">
              <span>Sending identity</span>
              <strong>Connected Microsoft mailbox</strong>
            </div>
            <div className="integration-detail">
              <span>Signature</span>
              <strong>Saved Marlow signature</strong>
            </div>
            <div className="integration-detail">
              <span>Sent items</span>
              <strong>Saved by Microsoft Graph</strong>
            </div>
          </div>
          <EmailConnection
            provider="microsoft"
            configured={demo || microsoftConfig.configured}
            status={demo ? "CONNECTED" : (integrations.get("MICROSOFT") ?? "DISCONNECTED")}
            mailboxes={mailboxes.filter((mailbox) => mailbox.provider === "MICROSOFT")}
          />
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
