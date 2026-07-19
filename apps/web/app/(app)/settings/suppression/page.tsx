import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { SuppressionManager } from "@/components/suppression-manager";
import { getSuppressions } from "@/lib/queries";

export const metadata = { title: "Suppression" };

export default async function SuppressionPage() {
  const suppressions = await getSuppressions();
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Suppression list"
        description="Organization-wide blocks override every campaign and every model decision."
      />
      <div className="settings-layout">
        <SettingsNav current="suppression" />
        <section>
          <SuppressionManager initialEntries={suppressions} />
        </section>
      </div>
    </div>
  );
}
