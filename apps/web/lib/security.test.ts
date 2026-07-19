import { describe, expect, it } from "vitest";
import { assertCsrf, safeRedirectPath } from "./security";

describe("request security", () => {
  it("rejects cross-site mutations", () => {
    const request = new Request("http://localhost:3000/api/drafts/1", {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
    });
    expect(() => assertCsrf(request)).toThrow(/cross-site/i);
  });

  it("allows a same-origin mutation", () => {
    const request = new Request("http://localhost:3000/api/drafts/1", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Sec-Fetch-Site": "same-origin" },
    });
    expect(() => assertCsrf(request)).not.toThrow();
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil", ""])(
    "rejects unsafe redirect %s",
    (value) => {
      expect(safeRedirectPath(value)).toBe("/dashboard");
    },
  );
});
