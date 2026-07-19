import { redirect } from "next/navigation";
import { getDrafts } from "@/lib/queries";

export const metadata = { title: "Review queue" };

export default async function ReviewQueuePage() {
  const drafts = await getDrafts();
  if (drafts[0]) redirect(`/review/${drafts[0].id}`);
  return null;
}
