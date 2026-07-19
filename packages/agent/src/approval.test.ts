import { describe, expect, it } from "vitest";
import { MockApolloProvider } from "@marlow/apollo";
import {
  ApprovalGate,
  hashContent,
  signApproval,
  verifyApproval,
  type ApprovalRecord,
  type ApprovalRepository,
  type DraftForSend,
  type SendRecord,
} from "./approval";
import { createDefaultToolRegistry } from "./policy";
import type { ApprovalContext } from "@marlow/shared";

class MemoryRepository implements ApprovalRepository {
  draft: DraftForSend = {
    id: "70000000-0000-4000-8000-000000000001",
    organizationId: "10000000-0000-4000-8000-000000000001",
    campaignId: "20000000-0000-4000-8000-000000000001",
    prospectId: "40000000-0000-4000-8000-000000000001",
    recipientEmail: "maya@acme.example",
    sendingMailboxId: "mailbox",
    subject: "Scaling operations",
    body: "Maya — your operations hiring suggests the team is growing. Northstar helps growing teams keep reporting consistent without replacing current tools. Would a short comparison next week be useful?",
    campaignPaused: false,
    suppressed: false,
    dailyLimitReached: false,
    mailboxAvailable: true,
    userCanSend: true,
    revision: 1,
  };
  approvals: ApprovalRecord[] = [];
  sends: SendRecord[] = [];
  private tail = Promise.resolve();

  async withDraftLock<T>(_draftId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
  async loadDraft() {
    return { ...this.draft };
  }
  async findSendByIdempotencyKey(_org: string, key: string) {
    return this.sends.find((send) => send.idempotencyKey === key);
  }
  async saveApproval(context: ApprovalContext) {
    const approval = { ...context, id: `approval-${this.approvals.length + 1}` };
    this.approvals.push(approval);
    return approval;
  }
  async reserveSend(_approval: ApprovalRecord, _draft: DraftForSend, key: string) {
    const send: SendRecord = {
      id: `send-${this.sends.length + 1}`,
      idempotencyKey: key,
      status: "QUEUED",
    };
    this.sends.push(send);
    return send;
  }
  async markApprovalConsumed(id: string, at: string) {
    const approval = this.approvals.find((item) => item.id === id);
    if (approval) approval.consumedAt = at;
  }
  async markSent(id: string, result: Awaited<ReturnType<MockApolloProvider["sendOneOffEmail"]>>) {
    const send = this.sends.find((item) => item.id === id);
    if (send) {
      send.status = "SENT";
      send.result = result;
    }
  }
  async markDeliveryUnknown(id: string) {
    const send = this.sends.find((item) => item.id === id);
    if (send) send.status = "DELIVERY_UNKNOWN";
  }
}

describe("approval gate", () => {
  it("rejects expired signed approvals", () => {
    const context: ApprovalContext = {
      organizationId: "10000000-0000-4000-8000-000000000001",
      userId: "11000000-0000-4000-8000-000000000001",
      prospectId: "40000000-0000-4000-8000-000000000001",
      draftId: "70000000-0000-4000-8000-000000000001",
      recipientEmail: "maya@acme.example",
      sendingMailboxId: "mailbox",
      subjectHash: hashContent("subject"),
      bodyHash: hashContent("body"),
      approvedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-07-19T00:01:00.000Z",
      nonce: "12345678901234567890123456789012",
    };
    expect(() =>
      verifyApproval(
        signApproval(context, "a-secure-test-secret-that-is-long-enough"),
        "a-secure-test-secret-that-is-long-enough",
        new Date("2026-07-19T00:02:00.000Z"),
      ),
    ).toThrow(/expired/i);
  });

  it("blocks suppressed recipients immediately before send", async () => {
    const repository = new MemoryRepository();
    repository.draft.suppressed = true;
    const gate = new ApprovalGate(
      repository,
      new MockApolloProvider(),
      createDefaultToolRegistry(),
      "a-secure-test-secret-that-is-long-enough",
    );
    await expect(
      gate.approveAndSend({
        organizationId: repository.draft.organizationId,
        userId: "11000000-0000-4000-8000-000000000001",
        draftId: repository.draft.id,
        mailboxId: "mailbox",
        idempotencyKey: "key",
      }),
    ).rejects.toThrow(/suppressed/i);
  });

  it("sends exactly once on concurrent double clicks", async () => {
    const repository = new MemoryRepository();
    const apollo = new MockApolloProvider();
    const gate = new ApprovalGate(
      repository,
      apollo,
      createDefaultToolRegistry(),
      "a-secure-test-secret-that-is-long-enough",
    );
    const input = {
      organizationId: repository.draft.organizationId,
      userId: "11000000-0000-4000-8000-000000000001",
      draftId: repository.draft.id,
      mailboxId: "mailbox",
      idempotencyKey: "same-click",
    };
    const [first, second] = await Promise.all([
      gate.approveAndSend(input),
      gate.approveAndSend(input),
    ]);
    expect(first.id).toBe(second.id);
    expect(apollo.sendInvocationCount).toBe(1);
  });
});
