import { CampaignChat } from "@/components/campaign-chat";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Onboarding" };

export default function OnboardingPage() {
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Let’s meet your market"
        description="Marlow will turn this conversation into a structured ideal customer profile."
      />
      <CampaignChat />
    </div>
  );
}
