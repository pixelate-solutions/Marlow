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
        message: "Demo company and domain blocked across the organization.",
      });
    const supabase = await createSupabaseServerClient();
    let result = await supabase
      .from("companies")
      .select("id,domain,name")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .maybeSingle();
    if (!result.data) {
      const prospect = await supabase
        .from("prospects")
        .select("companies(id,domain,name)")
        .eq("id", id)
        .eq("organization_id", auth.organizationId)
        .maybeSingle();
      const company =
        prospect.data &&
        (Array.isArray(prospect.data.companies)
          ? prospect.data.companies[0]
          : prospect.data.companies);
      result = { data: company ?? null, error: prospect.error } as typeof result;
    }
    if (result.error || !result.data)
      throw new AppError("NOT_FOUND", "Company was not found.", 404);
    await supabase.from("suppression_entries").upsert(
      {
        organization_id: auth.organizationId,
        suppression_type: "DOMAIN",
        normalized_value: result.data.domain,
        reason: `Blocked company: ${result.data.name}`,
        source: "USER",
        created_by: auth.userId,
      },
      { onConflict: "organization_id,suppression_type,normalized_value" },
    );
    await supabase
      .from("companies")
      .update({ blocked_at: new Date().toISOString(), blocked_by: auth.userId })
      .eq("id", result.data.id);
    return apiOk({
      id: result.data.id,
      blocked: true,
      message: "Company and domain blocked across the organization.",
    });
  } catch (error) {
    return apiError(error);
  }
}
