import { describe, expect, it } from "vitest";
import { MockApolloProvider } from "./mock-provider";

describe("MockApolloProvider", () => {
  it("paginates searches", async () => {
    const provider = new MockApolloProvider();
    const first = await provider.searchCompanies({
      industries: [],
      employeeRanges: [],
      revenueRanges: [],
      locations: [],
      technologies: [],
      keywords: [],
      exclusions: [],
      pageSize: 1,
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe("1");
    const second = await provider.searchCompanies({
      industries: [],
      employeeRanges: [],
      revenueRanges: [],
      locations: [],
      technologies: [],
      keywords: [],
      exclusions: [],
      ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
      pageSize: 1,
    });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it("deduplicates sends by idempotency key", async () => {
    const provider = new MockApolloProvider();
    const input = {
      mailboxId: "mailbox",
      recipientEmail: "maya@example.com",
      subject: "Hello",
      body: "Body",
      idempotencyKey: "stable-key",
    };
    const [first, second] = await Promise.all([
      provider.sendOneOffEmail(input),
      provider.sendOneOffEmail(input),
    ]);
    expect(first.externalMessageId).toBe(second.externalMessageId);
    expect(provider.sendInvocationCount).toBe(1);
  });
});
