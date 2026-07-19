import { describe, expect, it } from "vitest";
import {
  GOOGLE_OAUTH_SCOPES,
  MICROSOFT_OAUTH_SCOPES,
  buildAuthorizationUrl,
  createPkce,
  signOAuthState,
  verifyOAuthState,
} from "./oauth";

describe("mailbox OAuth", () => {
  it("creates a PKCE verifier and matching SHA-256 challenge", () => {
    const pkce = createPkce();
    expect(pkce.verifier.length).toBeGreaterThan(40);
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pkce.challenge).not.toBe(pkce.verifier);
  });

  it("signs state and rejects tampering", () => {
    const signed = signOAuthState({ organizationId: "org-1" }, "secret");
    expect(verifyOAuthState(signed, "secret")).toEqual({ organizationId: "org-1" });
    expect(() => verifyOAuthState(`${signed}x`, "secret")).toThrow();
  });

  it("requests offline Gmail sending, reply search, and signature access", () => {
    const url = new URL(
      buildAuthorizationUrl({
        provider: "GMAIL",
        clientId: "google-client",
        redirectUri: "https://example.com/google/callback",
        state: "state",
        challenge: "challenge",
      }),
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...GOOGLE_OAUTH_SCOPES]);
    expect(GOOGLE_OAUTH_SCOPES).toContain("https://www.googleapis.com/auth/gmail.readonly");
  });

  it("requests delegated Microsoft sending, reply metadata, and refresh access", () => {
    const url = new URL(
      buildAuthorizationUrl({
        provider: "MICROSOFT",
        clientId: "microsoft-client",
        redirectUri: "https://example.com/microsoft/callback",
        state: "state",
        challenge: "challenge",
      }),
    );
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...MICROSOFT_OAUTH_SCOPES]);
    expect(MICROSOFT_OAUTH_SCOPES).toContain("Mail.ReadBasic");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
