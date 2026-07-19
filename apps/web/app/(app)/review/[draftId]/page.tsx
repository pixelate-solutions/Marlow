import { notFound } from "next/navigation";
import { DraftReview } from "@/components/draft-review";
import { PageHeader } from "@/components/page-header";
import { getDraft, getDrafts } from "@/lib/queries";

export default async function ReviewDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const [draft, drafts] = await Promise.all([getDraft(draftId), getDrafts()]);
  if (!draft) notFound();
  return (
    <div className="page">
      <PageHeader
        title="Review queue"
        description="Check the evidence, shape the message, and approve only when it feels right."
      />
      <DraftReview draft={draft} drafts={drafts} />
    </div>
  );
}
