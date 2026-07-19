import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@marlow/shared";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    if (isDemoMode())
      return apiOk({
        id,
        blocked: true,
        message: "Demo prospect blocked across the organization.",
      });
    const supabase = await createSupabaseServerClient();
    const { data: prospect, error } = await supabase
      .from("prospects")
      .select("id,normalized_email,source_data")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw new AppError("NOT_FOUND", "Prospect was not found.", 404);
    const value =
      prospect.normalized_email ||
      String((prospect.source_data as Record<string, unknown>)?.apollo_person_id ?? id);
    const type = prospect.normalized_email ? "EMAIL" : "APOLLO_PERSON_ID";
    await supabase.from("suppression_entries").upsert(
      {
        organization_id: auth.organizationId,
        suppression_type: type,
        normalized_value: value,
        reason: "Blocked from review queue",
        source: "USER",
        created_by: auth.userId,
      },
      { onConflict: "organization_id,suppression_type,normalized_value" },
    );
    await supabase
      .from("prospects")
      .update({
        blocked_at: new Date().toISOString(),
        blocked_by: auth.userId,
        status: "SUPPRESSED",
      })
      .eq("id", id);
    return apiOk({ id, blocked: true, message: "Prospect blocked across the organization." });
  } catch (error) {
    return apiError(error);
  }
}
