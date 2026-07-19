import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getAuthContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/sign-in");
  if (auth.demo)
    return (
      <AppShell
        identity={{
          workspaceName: "Northstar",
          workspaceLabel: "Demo workspace",
          userName: "Alex Morgan",
          userLabel: "Workspace owner",
          initials: "AM",
        }}
        reviewCount={7}
      >
        {children}
      </AppShell>
    );
  const supabase = await createSupabaseServerClient();
  const [organizationResult, profileResult, reviewResult] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", auth.organizationId).single(),
    supabase
      .from("user_profiles")
      .select("full_name,job_title")
      .eq("organization_id", auth.organizationId)
      .eq("user_id", auth.userId)
      .maybeSingle(),
    supabase
      .from("outreach_drafts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", auth.organizationId)
      .eq("status", "PENDING_USER_APPROVAL")
      .is("deleted_at", null),
  ]);
  const userName = profileResult.data?.full_name || auth.email.split("@")[0] || "Marlow user";
  const initials = String(userName)
    .split(/\s+/)
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <AppShell
      identity={{
        workspaceName: organizationResult.data?.name ?? "Workspace",
        workspaceLabel: `${auth.role} workspace`,
        userName,
        userLabel: profileResult.data?.job_title || auth.email,
        initials,
      }}
      reviewCount={reviewResult.count ?? 0}
    >
      {children}
    </AppShell>
  );
}
