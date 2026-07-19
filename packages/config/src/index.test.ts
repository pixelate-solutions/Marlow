import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./index";

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
});
