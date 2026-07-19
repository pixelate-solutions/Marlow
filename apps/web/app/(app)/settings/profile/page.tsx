import { PageHeader } from "@/components/page-header";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { SettingsNav } from "@/components/settings-nav";
import { getProfileSettings } from "@/lib/queries";

export const metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const settings = await getProfileSettings();
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Your profile"
        description="Marlow uses this context when building a sender identity and signature."
      />
      <div className="settings-layout">
        <SettingsNav current="profile" />
        <ProfileSettingsForm settings={settings} />
      </div>
    </div>
  );
}
