import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    if (isDemoMode()) return apiOk({ id, message: "Demo suppression removed for this session." });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("suppression_entries")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .is("revoked_at", null)
      .select("id,suppression_type,normalized_value")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new AppError("NOT_FOUND", "Suppression entry was not found.", 404);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "SUPPRESSION_REVOKED",
      entity_type: "suppression_entry",
      entity_id: data.id,
      immutable_data: { type: data.suppression_type, value: data.normalized_value },
    });
    return apiOk({ id: data.id, message: "Suppression removed." });
  } catch (error) {
    return apiError(error);
  }
}
