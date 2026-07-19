import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApolloProvider, ApolloSendResult } from "@marlow/apollo";
import { AppError, DEFAULTS, type ApprovalContext } from "@marlow/shared";
import type { ToolPolicyRegistry } from "./policy";

export function hashContent(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashApprovedBody(input: {
  body: string;
  signatureText?: string;
  signatureHtml?: string;
  complianceFooterText?: string;
}): string {
  return hashContent(
    [
      input.body,
      input.signatureText ?? "",
      input.signatureHtml ?? "",
      input.complianceFooterText ?? "",
    ].join(String.fromCharCode(30)),
  );
}

export function signApproval(context: ApprovalContext, secret: string): string {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyApproval(token: string, secret: string, now = new Date()): ApprovalContext {
  const [payload, signature] = token.split(".");
  if (!payload || !signature)
    throw new AppError("APPROVAL_MISMATCH", "Approval token is malformed.", 409);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new AppError("APPROVAL_MISMATCH", "Approval signature is invalid.", 409);
  const context = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ApprovalContext;
  if (new Date(context.expiresAt) <= now)
    throw new AppError("APPROVAL_EXPIRED", "Approval has expired.", 409);
  return context;
}

export type DraftForSend = {
  id: string;
  organizationId: string;
  campaignId: string;
  prospectId: string;
  recipientEmail: string;
  sendingMailboxId: string;
  subject: string;
  body: string;
  campaignPaused: boolean;
  suppressed: boolean;
  dailyLimitReached: boolean;
  mailboxAvailable: boolean;
  userCanSend: boolean;
  revision: number;
};

export type ApprovalRecord = ApprovalContext & { id: string; consumedAt?: string };
export type SendRecord = {
  id: string;
  idempotencyKey: string;
  status: "QUEUED" | "SENT" | "FAILED" | "DELIVERY_UNKNOWN";
  result?: ApolloSendResult;
};

export interface ApprovalRepository {
  withDraftLock<T>(draftId: string, operation: () => Promise<T>): Promise<T>;
  loadDraft(draftId: string): Promise<DraftForSend>;
  findSendByIdempotencyKey(organizationId: string, key: string): Promise<SendRecord | undefined>;
  saveApproval(context: ApprovalContext): Promise<ApprovalRecord>;
  reserveSend(approval: ApprovalRecord, draft: DraftForSend, key: string): Promise<SendRecord>;
  markApprovalConsumed(approvalId: string, at: string): Promise<void>;
  markSent(sendId: string, result: ApolloSendResult): Promise<void>;
  markDeliveryUnknown(sendId: string, message: string): Promise<void>;
}

export class ApprovalGate {
  constructor(
    private readonly repository: ApprovalRepository,
    private readonly apollo: ApolloProvider,
    private readonly policies: ToolPolicyRegistry,
    private readonly signingSecret: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async approveAndSend(input: {
    organizationId: string;
    userId: string;
    draftId: string;
    mailboxId: string;
    idempotencyKey: string;
  }): Promise<SendRecord> {
    return this.repository.withDraftLock(input.draftId, async () => {
      const existing = await this.repository.findSendByIdempotencyKey(
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) return existing;
      const draft = await this.repository.loadDraft(input.draftId);
      if (draft.organizationId !== input.organizationId || !draft.userCanSend)
        throw new AppError("INSUFFICIENT_PERMISSION", "You cannot approve this draft.", 403);
      if (draft.campaignPaused) throw new AppError("APPROVAL_MISMATCH", "Campaign is paused.", 409);
      if (draft.suppressed)
        throw new AppError("PROSPECT_SUPPRESSED", "Prospect is suppressed.", 409);
      if (draft.dailyLimitReached)
        throw new AppError("DAILY_LIMIT_REACHED", "Daily send limit has been reached.", 409);
      if (!draft.mailboxAvailable || draft.sendingMailboxId !== input.mailboxId)
        throw new AppError(
          "APPROVAL_MISMATCH",
          "Sending mailbox does not match or is unavailable.",
          409,
        );
      const approvedAt = this.clock();
      const context: ApprovalContext = {
        organizationId: draft.organizationId,
        userId: input.userId,
        prospectId: draft.prospectId,
        draftId: draft.id,
        recipientEmail: draft.recipientEmail,
        sendingMailboxId: draft.sendingMailboxId,
        subjectHash: hashContent(draft.subject),
        bodyHash: hashContent(draft.body),
        approvedAt: approvedAt.toISOString(),
        expiresAt: new Date(
          approvedAt.getTime() + DEFAULTS.approvalTtlSeconds * 1_000,
        ).toISOString(),
        nonce: randomBytes(24).toString("base64url"),
      };
      const approval = await this.repository.saveApproval(context);
      const token = signApproval(context, this.signingSecret);
      const verified = verifyApproval(token, this.signingSecret, this.clock());
      const current = await this.repository.loadDraft(input.draftId);
      if (
        hashContent(current.subject) !== verified.subjectHash ||
        hashContent(current.body) !== verified.bodyHash ||
        current.recipientEmail !== verified.recipientEmail ||
        current.sendingMailboxId !== verified.sendingMailboxId
      ) {
        throw new AppError(
          "APPROVAL_MISMATCH",
          "Draft, recipient, or mailbox changed after approval.",
          409,
        );
      }
      const send = await this.repository.reserveSend(approval, current, input.idempotencyKey);
      await this.repository.markApprovalConsumed(approval.id, this.clock().toISOString());
      this.policies.authorize("apollo.send_one_off_email", {
        actor: "approval-gate",
        campaignPaused: false,
        creditsRemaining: 0,
        validApproval: true,
      });
      try {
        const result = await this.apollo.sendOneOffEmail({
          mailboxId: current.sendingMailboxId,
          recipientEmail: current.recipientEmail,
          subject: current.subject,
          body: current.body,
          idempotencyKey: input.idempotencyKey,
        });
        await this.repository.markSent(send.id, result);
        return { ...send, status: "SENT", result };
      } catch (error) {
        await this.repository.markDeliveryUnknown(
          send.id,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    });
  }
}
