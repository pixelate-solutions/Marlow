import { PageHeader } from "@/components/page-header";
import { SendingSettingsForm } from "@/components/sending-settings-form";
import { SettingsNav } from "@/components/settings-nav";
import { getSendingSettings } from "@/lib/queries";

export const metadata = { title: "Sending settings" };

export default async function SendingSettingsPage() {
  const settings = await getSendingSettings();
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Sending settings"
        description="Set the identity, limits, schedule, and compliance footer enforced before every send."
      />
      <div className="settings-layout">
        <SettingsNav current="sending" />
        <SendingSettingsForm settings={settings} />
      </div>
    </div>
  );
}
