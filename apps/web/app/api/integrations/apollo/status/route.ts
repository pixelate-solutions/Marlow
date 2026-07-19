import { apiError, apiOk } from "@/lib/api";
import { getApolloProvider } from "@/lib/apollo";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  let provider: Awaited<ReturnType<typeof getApolloProvider>> | undefined;
  try {
    const auth = await requireAuth();
    if (isDemoMode()) {
      provider = await getApolloProvider(auth.organizationId);
      return apiOk({ status: "CONNECTED", mailboxes: await provider.listMailboxes(), demo: true });
    }
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("integrations")
      .select("status,display_name,last_verified_at,scopes")
      .eq("organization_id", auth.organizationId)
      .eq("provider", "APOLLO")
      .maybeSingle();
    if (!data || data.status !== "CONNECTED")
      return apiOk({ status: data?.status ?? "DISCONNECTED", mailboxes: [] });
    provider = await getApolloProvider(auth.organizationId);
    const mailboxes = await provider.listMailboxes();
    return apiOk({ ...data, mailboxes });
  } catch (error) {
    return apiError(error);
  } finally {
    await provider?.disconnect();
  }
}
