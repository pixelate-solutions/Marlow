import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  jobTitle: z.string().trim().max(100),
});

export async function PATCH(request: Request) {
  try {
    assertCsrf(request);
    const auth = await requireAuth();
    const input = profileSchema.parse(await request.json());
    if (isDemoMode()) return apiOk({ ...input, message: "Demo profile saved for this request." });
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("user_profiles").upsert(
      {
        organization_id: auth.organizationId,
        user_id: auth.userId,
        full_name: input.fullName,
        job_title: input.jobTitle || null,
      },
      { onConflict: "organization_id,user_id" },
    );
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "PROFILE_UPDATED",
      entity_type: "user_profile",
      immutable_data: { fullName: input.fullName, jobTitle: input.jobTitle },
    });
    return apiOk({ ...input, message: "Profile saved." });
  } catch (error) {
    return apiError(error);
  }
}
