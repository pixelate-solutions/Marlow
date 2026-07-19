import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function PATCH(request: Request) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin"]);
    const input = workspaceSchema.parse(await request.json());
    if (isDemoMode())
      return apiOk({ ...input, message: "Demo workspace settings saved for this request." });
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("organizations")
      .update(input)
      .eq("id", auth.organizationId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "WORKSPACE_UPDATED",
      entity_type: "organization",
      entity_id: auth.organizationId,
      immutable_data: input,
    });
    return apiOk({ ...input, message: "Workspace settings saved." });
  } catch (error) {
    return apiError(error);
  }
}
