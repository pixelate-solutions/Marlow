import { apiError, apiOk } from "@/lib/api";
import { requireAuth, isDemoMode } from "@/lib/auth";
import { demoCampaigns } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@marlow/shared";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    if (isDemoMode()) {
      const campaign = demoCampaigns.find((item) => item.id === id);
      if (!campaign) throw new AppError("NOT_FOUND", "Campaign was not found.", 404);
      return apiOk(campaign);
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*,campaign_profiles(*),campaign_limits(*),agent_runs(*),agent_run_events(*)")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw new AppError("NOT_FOUND", "Campaign was not found.", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(error);
  }
}
