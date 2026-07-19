import { describe, expect, it } from "vitest";
import { findDuplicate } from "./deduplication";

describe("prospect deduplication", () => {
  const existing = [
    {
      apolloPersonId: "P-1",
      email: "maya@acme.com",
      fullName: "Maya Chen",
      companyDomain: "acme.com",
    },
  ];
  it("matches normalized emails", () => {
    expect(
      findDuplicate(
        { email: "MAYA@ACME.COM", fullName: "Different Name", companyDomain: "other.com" },
        existing,
      ),
    ).toBeDefined();
  });
  it("matches name plus domain when IDs are absent", () => {
    expect(
      findDuplicate({ fullName: "maya chen", companyDomain: "ACME.COM" }, existing),
    ).toBeDefined();
  });
});
