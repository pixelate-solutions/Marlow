import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    if (isDemoMode()) return apiOk({ id, status: "SKIPPED", message: "Demo draft skipped." });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("outreach_drafts")
      .update({ status: "SKIPPED" })
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .eq("status", "PENDING_USER_APPROVAL")
      .select("id,status")
      .single();
    if (error) throw new Error(error.message);
    return apiOk({ ...data, message: "Draft skipped." });
  } catch (error) {
    return apiError(error);
  }
}
