import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { demoSuppressions } from "@/lib/demo-data";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const suppressionSchema = z.object({
  type: z.enum(["EMAIL", "DOMAIN", "APOLLO_PERSON_ID", "APOLLO_CONTACT_ID", "COMPANY"]),
  value: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(1_000),
});

function serializeSuppression(entry: {
  id: string;
  suppression_type: string;
  normalized_value: unknown;
  reason: string | null;
  source: string;
  created_at: string;
}) {
  return {
    id: entry.id,
    type: entry.suppression_type,
    value: String(entry.normalized_value),
    reason: entry.reason ?? "No reason provided",
    source: entry.source,
    createdAt: new Date(entry.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (isDemoMode()) return apiOk(demoSuppressions);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("suppression_entries")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return apiOk(data.map(serializeSuppression));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const input = suppressionSchema.parse(await request.json());
    if (isDemoMode())
      return apiOk(
        {
          id: `demo-suppression-${Date.now()}`,
          type: input.type,
          value: input.value.toLowerCase(),
          reason: input.reason,
          source: "User block",
          createdAt: new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        },
        { status: 201 },
      );
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("suppression_entries")
      .upsert(
        {
          organization_id: auth.organizationId,
          suppression_type: input.type,
          normalized_value: input.value.toLowerCase(),
          reason: input.reason,
          source: "USER",
          created_by: auth.userId,
        },
        { onConflict: "organization_id,suppression_type,normalized_value" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      actor_type: "USER",
      action: "SUPPRESSION_ADDED",
      entity_type: "suppression_entry",
      entity_id: data.id,
      immutable_data: {
        type: input.type,
        value: input.value.toLowerCase(),
        reason: input.reason,
      },
    });
    return apiOk(serializeSuppression(data), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
