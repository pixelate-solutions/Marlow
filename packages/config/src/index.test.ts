import { describe, expect, it } from "vitest";
import {
  getSupabasePublishableKey,
  getSupabaseSecretKey,
  getTavilyApiKey,
  parseEnvironment,
} from "./index";

describe("runtime environment", () => {
  it("treats blank optional development secrets as absent", () => {
    const environment = parseEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "", MODEL_API_KEY: "" });
    expect(environment.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(environment.MODEL_API_KEY).toBeUndefined();
  });

  it("fails closed when production secrets are missing", () => {
    expect(() =>
      parseEnvironment({ NODE_ENV: "production" }, { requireProductionSecrets: true }),
    ).toThrow(/Missing required production/);
  });

  it.each(["MOCK_INTEGRATIONS", "DEMO_MODE"])("rejects %s in production", (flag) => {
    expect(() => parseEnvironment({ NODE_ENV: "production", [flag]: "true" })).toThrow(
      /may not be enabled/,
    );
  });

  it("hard-locks the production model id", () => {
    expect(() => parseEnvironment({ META_MODEL_ID: "another-model" })).toThrow();
  });

  it("prefers current Supabase keys while retaining legacy fallbacks", () => {
    const current = parseEnvironment({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_current",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon",
      SUPABASE_SECRET_KEY: "sb_secret_current",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
    });
    expect(getSupabasePublishableKey(current)).toBe("sb_publishable_current");
    expect(getSupabaseSecretKey(current)).toBe("sb_secret_current");

    const legacy = parseEnvironment({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
    });
    expect(getSupabasePublishableKey(legacy)).toBe("legacy-anon");
    expect(getSupabaseSecretKey(legacy)).toBe("legacy-service-role");
  });

  it("validates the web runtime with current Supabase key names", () => {
    expect(() =>
      parseEnvironment(
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
          SUPABASE_SECRET_KEY: "sb_secret_test",
          MODEL_API_KEY: "model-key",
          ENCRYPTION_KEY: "e".repeat(32),
          APPROVAL_SIGNING_SECRET: "a".repeat(32),
          CRON_SECRET: "c".repeat(32),
        },
        { requireProductionSecrets: true, runtime: "web" },
      ),
    ).not.toThrow();
  });

  it("does not require browser or OAuth configuration for the worker runtime", () => {
    expect(() =>
      parseEnvironment(
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SECRET_KEY: "sb_secret_test",
          MODEL_API_KEY: "model-key",
          ENCRYPTION_KEY: "e".repeat(32),
        },
        { requireProductionSecrets: true, runtime: "worker" },
      ),
    ).not.toThrow();
  });

  it("allows the worker credential broker instead of the encryption key", () => {
    expect(() =>
      parseEnvironment(
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SECRET_KEY: "sb_secret_test",
          MODEL_API_KEY: "model-key",
          WORKER_API_SECRET: "w".repeat(32),
        },
        { requireProductionSecrets: true, runtime: "worker" },
      ),
    ).not.toThrow();
  });

  it("requires a Tavily key when the worker selects Tavily", () => {
    expect(() =>
      parseEnvironment(
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SECRET_KEY: "sb_secret_test",
          MODEL_API_KEY: "model-key",
          ENCRYPTION_KEY: "e".repeat(32),
          WEB_SEARCH_PROVIDER: "tavily",
        },
        { requireProductionSecrets: true, runtime: "worker" },
      ),
    ).toThrow(/TAVILY_API_KEY/);
  });

  it("prefers the explicit Tavily key and retains the generic fallback", () => {
    expect(
      getTavilyApiKey(
        parseEnvironment({ TAVILY_API_KEY: "tvly-current", WEB_SEARCH_API_KEY: "legacy" }),
      ),
    ).toBe("tvly-current");
    expect(getTavilyApiKey(parseEnvironment({ WEB_SEARCH_API_KEY: "legacy" }))).toBe("legacy");
  });
});
