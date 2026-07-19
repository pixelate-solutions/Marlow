import { Plus } from "lucide-react";
import Link from "next/link";
import { CampaignBrowser } from "@/components/campaign-browser";
import { PageHeader } from "@/components/page-header";
import { getCampaigns } from "@/lib/queries";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();
  return (
    <div className="page">
      <PageHeader
        title="Campaigns"
        description="Give Marlow a market to understand, then follow the work from search to draft."
        actions={
          <Link className="button button--primary button--md" href="/campaigns/new">
            <Plus size={15} />
            New campaign
          </Link>
        }
      />
      <CampaignBrowser campaigns={campaigns} />
    </div>
  );
}
