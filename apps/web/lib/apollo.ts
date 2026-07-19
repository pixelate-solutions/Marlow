import { ApolloMcpProvider, MockApolloProvider, type ApolloProvider } from "@marlow/apollo";
import { decryptSecret, type EncryptedSecret } from "@marlow/database";
import { AppError } from "@marlow/shared";
import { createSupabaseAdminClient } from "./supabase/admin";
import { isDemoMode } from "./auth";

const demoApollo = new MockApolloProvider();

export async function getApolloProvider(organizationId: string): Promise<ApolloProvider> {
  if (isDemoMode()) return demoApollo;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is not configured.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .select("status,integration_credentials(encrypted_payload,iv,auth_tag,key_version)")
    .eq("organization_id", organizationId)
    .eq("provider", "APOLLO")
    .single();
  if (error || !data)
    throw new AppError("APOLLO_NOT_CONNECTED", "Connect Apollo before using this feature.", 409);
  if (data.status === "REAUTHORIZATION_REQUIRED")
    throw new AppError("APOLLO_REAUTHORIZATION_REQUIRED", "Reconnect Apollo to continue.", 409);
  if (data.status !== "CONNECTED")
    throw new AppError("APOLLO_NOT_CONNECTED", "Connect Apollo before using this feature.", 409);
  const credential = Array.isArray(data.integration_credentials)
    ? data.integration_credentials[0]
    : data.integration_credentials;
  if (!credential)
    throw new AppError("APOLLO_NOT_CONNECTED", "Apollo credentials are unavailable.", 409);
  const encrypted: EncryptedSecret = {
    ciphertext: String(credential.encrypted_payload),
    iv: String(credential.iv),
    authTag: String(credential.auth_tag),
    keyVersion: Number(credential.key_version),
  };
  const tokens = JSON.parse(decryptSecret(encrypted, encryptionKey)) as { accessToken?: string };
  if (!tokens.accessToken)
    throw new AppError("APOLLO_REAUTHORIZATION_REQUIRED", "Reconnect Apollo to continue.", 409);
  return new ApolloMcpProvider({
    url: process.env.APOLLO_MCP_URL ?? "https://mcp.apollo.io/mcp",
    accessToken: tokens.accessToken,
  });
}
