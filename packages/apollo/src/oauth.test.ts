import { describe, expect, it } from "vitest";
import { buildAuthorizationUrl, type OAuthMetadata } from "./oauth";

const metadata: OAuthMetadata = {
  authorizationEndpoint: "https://mcp.apollo.io/mcp/oauth_metadata/redirect_to_authorize",
  tokenEndpoint: "https://mcp.apollo.io/api/v1/oauth/token",
  scopesSupported: ["read_user_profile", "app_scopes", "mixed_people_api_search"],
};

describe("buildAuthorizationUrl", () => {
  it("uses the scopes registered for the Apollo OAuth client", () => {
    const authorizationUrl = buildAuthorizationUrl({
      metadata,
      clientId: "client-id",
      redirectUri: "https://marlow.example/api/integrations/apollo/callback",
      state: "signed-state",
      challenge: "pkce-challenge",
    });

    const url = new URL(authorizationUrl);
    expect(url.searchParams.get("scope")).toBeNull();
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://marlow.example/api/integrations/apollo/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
