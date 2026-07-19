import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { EmailProviderName, OAuthTokenSet } from "./types";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.settings.basic",
] as const;

export const MICROSOFT_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Mail.ReadBasic",
] as const;

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function signOAuthState(payload: Record<string, string>, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string, secret: string): Record<string, string> {
  const [encoded, supplied] = state.split(".");
  if (!encoded || !supplied) throw new Error("Invalid mailbox OAuth state.");
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new Error("Invalid mailbox OAuth state signature.");
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid mailbox OAuth state payload.");
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function providerEndpoints(provider: EmailProviderName, tenant = "common") {
  if (provider === "GMAIL")
    return {
      authorization: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
    };
  return {
    authorization: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
  };
}

export function buildAuthorizationUrl(input: {
  provider: EmailProviderName;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  tenant?: string;
}): string {
  const endpoints = providerEndpoints(input.provider, input.tenant);
  const url = new URL(endpoints.authorization);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set(
    "scope",
    (input.provider === "GMAIL" ? GOOGLE_OAUTH_SCOPES : MICROSOFT_OAUTH_SCOPES).join(" "),
  );
  if (input.provider === "GMAIL") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
  } else {
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

async function readTokenResponse(response: Response, provider: EmailProviderName) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string")
    throw new Error(
      `${provider === "GMAIL" ? "Google" : "Microsoft"} OAuth token exchange failed.`,
    );
  return {
    accessToken: payload.access_token,
    ...(typeof payload.refresh_token === "string" ? { refreshToken: payload.refresh_token } : {}),
    ...(typeof payload.expires_in === "number" ? { expiresIn: payload.expires_in } : {}),
    ...(typeof payload.scope === "string" ? { scope: payload.scope } : {}),
    ...(typeof payload.token_type === "string" ? { tokenType: payload.token_type } : {}),
  } satisfies OAuthTokenSet;
}

export async function exchangeAuthorizationCode(input: {
  provider: EmailProviderName;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  verifier: string;
  tenant?: string;
}): Promise<OAuthTokenSet> {
  const endpoints = providerEndpoints(input.provider, input.tenant);
  const response = await fetch(endpoints.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      ...(input.provider === "MICROSOFT" ? { scope: MICROSOFT_OAUTH_SCOPES.join(" ") } : {}),
    }),
  });
  return readTokenResponse(response, input.provider);
}

export async function refreshAccessToken(input: {
  provider: EmailProviderName;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tenant?: string;
}): Promise<OAuthTokenSet> {
  const endpoints = providerEndpoints(input.provider, input.tenant);
  const response = await fetch(endpoints.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
      ...(input.provider === "MICROSOFT" ? { scope: MICROSOFT_OAUTH_SCOPES.join(" ") } : {}),
    }),
  });
  return readTokenResponse(response, input.provider);
}
