import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@marlow/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export function assertCsrf(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").origin;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    !origin ||
    new URL(origin).origin !== expected ||
    (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))
  ) {
    throw new AppError("INSUFFICIENT_PERMISSION", "Cross-site request was blocked.", 403);
  }
}

export function newIdempotencyKey(): string {
  return randomBytes(24).toString("base64url");
}

export function hashIp(value: string | null): string | null {
  if (!value) return null;
  const secret = process.env.APPROVAL_SIGNING_SECRET ?? "development-only-ip-hash-secret";
  return createHash("sha256")
    .update(`${secret}:${value.split(",")[0]?.trim()}`)
    .digest("hex");
}

export async function enforceRateLimit(
  client: SupabaseClient,
  organizationId: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await client.rpc("consume_rate_limit", {
    p_organization_id: organizationId,
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(error.message);
  if (!data)
    throw new AppError(
      "INSUFFICIENT_PERMISSION",
      "Too many requests. Please wait and try again.",
      429,
    );
}

export function safeRedirectPath(value: string | null, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}
