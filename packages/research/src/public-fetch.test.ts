import { describe, expect, it } from "vitest";
import { assertPublicUrl } from "./public-fetch";

describe("public fetch SSRF protection", () => {
  it.each([
    "http://127.0.0.1/admin",
    "http://10.0.0.2",
    "http://localhost:3000",
    "file:///etc/passwd",
  ])("blocks %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow();
  });
});
