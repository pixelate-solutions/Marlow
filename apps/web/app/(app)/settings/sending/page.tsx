import { PageHeader } from "@/components/page-header";
import { SendingSettingsForm } from "@/components/sending-settings-form";
import { SettingsNav } from "@/components/settings-nav";
import { getAuthContext, isDemoMode } from "@/lib/auth";
import { getSendingMailboxes } from "@/lib/mailboxes";
import { getSendingSettings } from "@/lib/queries";

export const metadata = { title: "Sending settings" };

export default async function SendingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo =
    requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : null;
  const [settings, auth] = await Promise.all([getSendingSettings(), getAuthContext()]);
  const mailboxes =
    auth && !isDemoMode()
      ? await getSendingMailboxes(auth.organizationId)
      : [
          {
            id: "demo-mailbox",
            email: "alex@northstar.example",
            displayName: "Alex Morgan",
            provider: "GMAIL" as const,
            status: "AVAILABLE" as const,
          },
        ];
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Sending settings"
        description="Set the identity, limits, schedule, and compliance footer enforced before every send."
      />
      <div className="settings-layout">
        <SettingsNav current="sending" />
        <SendingSettingsForm settings={settings} mailboxes={mailboxes} returnTo={returnTo} />
      </div>
    </div>
  );
}
