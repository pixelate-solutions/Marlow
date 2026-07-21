import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ReviewQueueEmptyState } from "@/components/review-queue-empty-state";
import { ReviewQueueLiveRefresh } from "@/components/review-queue-live-refresh";
import { getCampaigns, getDrafts } from "@/lib/queries";

export const metadata = { title: "Review queue" };

export default async function ReviewQueuePage() {
  const [drafts, campaigns] = await Promise.all([getDrafts(), getCampaigns()]);
  if (drafts[0]) redirect(`/review/${drafts[0].id}`);
  return (
    <div className="page">
      <ReviewQueueLiveRefresh />
      <PageHeader
        title="Review queue"
        description="Review grounded email drafts before anything is approved or sent."
      />
      <ReviewQueueEmptyState campaigns={campaigns} />
    </div>
  );
}
