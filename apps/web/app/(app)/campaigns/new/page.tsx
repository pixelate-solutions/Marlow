import { PageHeader } from "@/components/page-header";
import { CampaignChat } from "@/components/campaign-chat";

export const metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Build a campaign with Marlow"
        description="Start with the big picture. Marlow will research what it can and ask only what is missing."
      />
      <CampaignChat />
    </div>
  );
}
