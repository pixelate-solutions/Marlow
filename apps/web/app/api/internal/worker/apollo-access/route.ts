import { createHash, timingSafeEqual } from "node:crypto";
import { decryptSecret, type EncryptedSecret } from "@marlow/database";
import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function matchesSecret(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function POST(request: Request) {
  try {
    const expected = process.env.WORKER_API_SECRET;
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!expected || !provided || !matchesSecret(provided, expected))
      throw new AppError("AUTHENTICATION_REQUIRED", "Worker authentication failed.", 401);

    const body = (await request.json()) as { organizationId?: unknown };
    if (typeof body.organizationId !== "string" || !body.organizationId)
      throw new AppError("VALIDATION_ERROR", "A workspace ID is required.", 400);
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey)
      throw new AppError("INTERNAL_ERROR", "Credential decryption is unavailable.", 503);

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("integrations")
      .select("status,integration_credentials(encrypted_payload,iv,auth_tag,key_version)")
      .eq("organization_id", body.organizationId)
      .eq("provider", "APOLLO")
      .single();
    if (error || data.status !== "CONNECTED")
      throw new AppError("APOLLO_NOT_CONNECTED", "Apollo is not connected.", 409);
    const raw = Array.isArray(data.integration_credentials)
      ? data.integration_credentials[0]
      : data.integration_credentials;
    if (!raw) throw new AppError("APOLLO_NOT_CONNECTED", "Apollo is not connected.", 409);
    const encrypted: EncryptedSecret = {
      ciphertext: String(raw.encrypted_payload),
      iv: String(raw.iv),
      authTag: String(raw.auth_tag),
      keyVersion: Number(raw.key_version),
    };
    let accessToken = "";
    try {
      const tokens = JSON.parse(decryptSecret(encrypted, encryptionKey)) as {
        accessToken?: unknown;
      };
      accessToken = typeof tokens.accessToken === "string" ? tokens.accessToken : "";
    } catch {
      throw new AppError(
        "APOLLO_REAUTHORIZATION_REQUIRED",
        "Apollo authorization needs to be renewed.",
        409,
      );
    }
    if (!accessToken)
      throw new AppError(
        "APOLLO_REAUTHORIZATION_REQUIRED",
        "Apollo authorization needs to be renewed.",
        409,
      );
    return apiOk({ accessToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
