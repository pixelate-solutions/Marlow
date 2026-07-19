import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthMetadata = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
  scopesSupported: string[];
};

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function signOAuthState(payload: Record<string, string>, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string, secret: string): Record<string, string> {
  const [encoded, supplied] = state.split(".");
  if (!encoded || !supplied) throw new Error("Invalid OAuth state.");
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new Error("Invalid OAuth state signature.");
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid OAuth state payload.");
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export async function discoverOAuthMetadata(mcpUrl: string): Promise<OAuthMetadata> {
  const url = new URL(mcpUrl);
  const protectedResourceUrl = new URL("/.well-known/oauth-protected-resource", url.origin);
  const resourceResponse = await fetch(protectedResourceUrl, {
    headers: { Accept: "application/json" },
  });
  if (!resourceResponse.ok)
    throw new Error("Apollo OAuth protected-resource metadata is unavailable.");
  const resource = (await resourceResponse.json()) as {
    authorization_servers?: string[];
    scopes_supported?: string[];
  };
  const issuer = resource.authorization_servers?.[0];
  if (!issuer) throw new Error("Apollo OAuth metadata did not identify an authorization server.");
  const issuerUrl = new URL(issuer);
  const candidates = [
    new URL(
      `/.well-known/oauth-authorization-server${issuerUrl.pathname === "/" ? "" : issuerUrl.pathname}`,
      issuerUrl.origin,
    ),
    new URL("/.well-known/openid-configuration", issuerUrl.origin),
  ];
  for (const candidate of candidates) {
    const response = await fetch(candidate, { headers: { Accept: "application/json" } });
    if (!response.ok) continue;
    const metadata = (await response.json()) as Record<string, unknown>;
    if (
      typeof metadata.authorization_endpoint !== "string" ||
      typeof metadata.token_endpoint !== "string"
    )
      continue;
    return {
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      ...(typeof metadata.revocation_endpoint === "string"
        ? { revocationEndpoint: metadata.revocation_endpoint }
        : {}),
      scopesSupported: Array.isArray(metadata.scopes_supported)
        ? metadata.scopes_supported.filter((scope): scope is string => typeof scope === "string")
        : (resource.scopes_supported ?? []),
    };
  }
  throw new Error("Apollo OAuth authorization metadata is unavailable.");
}

export function buildAuthorizationUrl(input: {
  metadata: OAuthMetadata;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  scopes: string[];
}): string {
  const url = new URL(input.metadata.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.scopes.length > 0) url.searchParams.set("scope", input.scopes.join(" "));
  return url.toString();
}

export async function exchangeAuthorizationCode(input: {
  metadata: OAuthMetadata;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.verifier,
  });
  const response = await fetch(input.metadata.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) throw new Error("Apollo OAuth token exchange failed.");
  const payload = (await response.json()) as Record<string, unknown>;
  if (typeof payload.access_token !== "string")
    throw new Error("Apollo OAuth response omitted the access token.");
  return {
    accessToken: payload.access_token,
    ...(typeof payload.refresh_token === "string" ? { refreshToken: payload.refresh_token } : {}),
    ...(typeof payload.expires_in === "number" ? { expiresIn: payload.expires_in } : {}),
    ...(typeof payload.scope === "string" ? { scope: payload.scope } : {}),
  };
}
