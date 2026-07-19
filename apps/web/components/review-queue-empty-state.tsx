import { FileCheck2 } from "lucide-react";
import Link from "next/link";
import { Card } from "@marlow/ui";

type CampaignSummary = {
  id: string;
  name: string;
  status: string;
};

const workingStatuses = new Set([
  "QUEUED",
  "SEARCHING_ACCOUNTS",
  "QUALIFYING_ACCOUNTS",
  "SEARCHING_PEOPLE",
  "ENRICHING",
  "RESEARCHING",
  "SCORING",
  "WRITING",
  "QUALITY_REVIEW",
]);

export function ReviewQueueEmptyState({ campaigns }: { campaigns: CampaignSummary[] }) {
  const discovering = campaigns.find((campaign) => campaign.status === "DISCOVERING");
  const ready = campaigns.find((campaign) => campaign.status === "READY");
  const working = campaigns.find((campaign) => workingStatuses.has(campaign.status));

  let title = "No drafts waiting for review";
  let description =
    "Drafts appear here after a campaign finishes discovery, finds qualified prospects, and prepares grounded emails.";
  let href = "/campaigns/new";
  let action = "Create a campaign";

  if (discovering) {
    title = "Finish campaign discovery first";
    description = `${discovering.name} still needs a few details before Marlow can find prospects and prepare emails.`;
    href = `/campaigns/${discovering.id}`;
    action = "Continue discovery";
  } else if (ready) {
    title = "Your campaign is ready to start";
    description = `${ready.name} has a complete profile. Start prospecting to build the review queue.`;
    href = `/campaigns/${ready.id}`;
    action = "Start prospecting";
  } else if (working) {
    title = "Marlow is preparing your drafts";
    description = `${working.name} is working through prospecting and research. Qualified drafts will appear here automatically.`;
    href = `/campaigns/${working.id}`;
    action = "View campaign progress";
  }

  return (
    <Card className="empty-state">
      <div>
        <span className="empty-state__icon">
          <FileCheck2 size={22} />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        <Link className="button button--primary button--md" href={href}>
          {action}
        </Link>
      </div>
    </Card>
  );
}
