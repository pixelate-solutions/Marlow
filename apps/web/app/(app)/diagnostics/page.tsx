import { Clock3, Coins, Send } from "lucide-react";
import { Badge, Card } from "@marlow/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Diagnostics" };

export default async function DiagnosticsPage() {
  await requireAuth(["owner", "admin"]);
  return (
    <div className="page">
      <PageHeader
        title="System diagnostics"
        description="Authorized operational view. Tool inputs are redacted and private model reasoning is never logged."
      />
      <div className="diagnostic-grid">
        <Card className="diagnostic-card">
          <span>Active runs</span>
          <strong>2</strong>
        </Card>
        <Card className="diagnostic-card">
          <span>Failed jobs</span>
          <strong>0</strong>
        </Card>
        <Card className="diagnostic-card">
          <span>Pending approvals</span>
          <strong>7</strong>
        </Card>
        <Card className="diagnostic-card">
          <span>Recent sends</span>
          <strong>18</strong>
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card className="section-card">
          <div className="section-card__header">
            <h2>Service health</h2>
            <Badge tone="success">Operational</Badge>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Error rate</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Muse Spark 1.1</td>
                <td>
                  <Badge tone="success">Available</Badge>
                </td>
                <td>0.8%</td>
                <td>2.4s</td>
              </tr>
              <tr>
                <td>Apollo remote MCP</td>
                <td>
                  <Badge tone="success">Connected</Badge>
                </td>
                <td>0.4%</td>
                <td>820ms</td>
              </tr>
              <tr>
                <td>Agent worker</td>
                <td>
                  <Badge tone="success">Heartbeat</Badge>
                </td>
                <td>0%</td>
                <td>4s ago</td>
              </tr>
              <tr>
                <td>Public research</td>
                <td>
                  <Badge tone="success">Available</Badge>
                </td>
                <td>1.1%</td>
                <td>1.8s</td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card className="section-card">
          <div className="section-card__header">
            <h2>Operational metrics</h2>
            <Badge tone="neutral">24 hours</Badge>
          </div>
          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-icon">
                <Clock3 size={14} />
              </span>
              <div className="activity-item__body">
                <strong>Search to draft</strong>
                <span>Average elapsed time</span>
              </div>
              <time>4m 18s</time>
            </div>
            <div className="activity-item">
              <span className="activity-icon activity-icon--research">
                <Coins size={14} />
              </span>
              <div className="activity-item__body">
                <strong>Apollo credits</strong>
                <span>Across active campaigns</span>
              </div>
              <time>42</time>
            </div>
            <div className="activity-item">
              <span className="activity-icon activity-icon--sent">
                <Send size={14} />
              </span>
              <div className="activity-item__body">
                <strong>Confirmed sends</strong>
                <span>No ambiguous deliveries</span>
              </div>
              <time>18</time>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
