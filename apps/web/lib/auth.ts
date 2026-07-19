import { AppError } from "@marlow/shared";
import { DEMO_IDS } from "./demo-data";
import { createSupabaseServerClient } from "./supabase/server";

export type AuthContext = {
  userId: string;
  organizationId: string;
  role: "owner" | "admin" | "member" | "viewer";
  email: string;
  demo: boolean;
};

export function isDemoMode(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.DEMO_MODE === "true" || !process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

export async function getAuthContext(): Promise<AuthContext | null> {
  if (isDemoMode()) {
    return {
      userId: DEMO_IDS.user,
      organizationId: DEMO_IDS.organization,
      role: "owner",
      email: "alex@northstar.example",
      demo: true,
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  return {
    userId: user.id,
    organizationId: membership.organization_id,
    role: membership.role as AuthContext["role"],
    email: user.email ?? "",
    demo: false,
  };
}

export async function requireAuth(roles?: AuthContext["role"][]): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw new AppError("AUTHENTICATION_REQUIRED", "Sign in is required.", 401);
  if (roles && !roles.includes(context.role))
    throw new AppError("INSUFFICIENT_PERMISSION", "Your role does not permit this action.", 403);
  return context;
}
