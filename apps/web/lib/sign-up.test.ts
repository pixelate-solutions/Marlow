import { describe, expect, it } from "vitest";
import { signUpErrorMessage, signUpSchema } from "./sign-up";

describe("account registration", () => {
  it("normalizes valid account details", () => {
    const result = signUpSchema.parse({
      fullName: "  Maya Chen  ",
      email: "  MAYA@EXAMPLE.COM ",
      password: "correct-horse-battery",
      confirmPassword: "correct-horse-battery",
    });
    expect(result.fullName).toBe("Maya Chen");
    expect(result.email).toBe("maya@example.com");
  });

  it("rejects mismatched passwords", () => {
    const result = signUpSchema.safeParse({
      fullName: "Maya Chen",
      email: "maya@example.com",
      password: "correct-horse-battery",
      confirmPassword: "different-password",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(signUpErrorMessage(result.error)).toMatch(/do not match/i);
  });

  it("rejects weak passwords and invalid email addresses", () => {
    const result = signUpSchema.safeParse({
      fullName: "Maya Chen",
      email: "not-an-email",
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("returns a safe message while the workspace schema is unavailable", () => {
    expect(signUpErrorMessage(new Error("MARLOW_SIGNUP_NOT_READY"))).toMatch(
      /finishing workspace setup/i,
    );
  });
});
