import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";
import { getWorkspaceSettings } from "@/lib/queries";

export const metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage() {
  const settings = await getWorkspaceSettings();
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Workspace settings"
        description="Manage your organization and the people who can approve outreach."
      />
      <div className="settings-layout">
        <SettingsNav current="workspace" />
        <WorkspaceSettingsForm settings={settings} />
      </div>
    </div>
  );
}
