import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { demoDrafts } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (isDemoMode()) return apiOk(demoDrafts);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("outreach_drafts")
      .select("*,prospects(*,companies(*)),lead_scores(*)")
      .eq("organization_id", auth.organizationId)
      .eq("status", "PENDING_USER_APPROVAL")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return apiOk(data);
  } catch (error) {
    return apiError(error);
  }
}
