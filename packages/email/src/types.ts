export type EmailProviderName = "GMAIL" | "MICROSOFT";

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
};

export type ProviderMailbox = {
  externalId: string;
  email: string;
  displayName: string;
  replyTo?: string;
  signatureHtml: string;
  signatureText: string;
  isDefault: boolean;
  isPrimary: boolean;
  available: boolean;
};

export type EmailSendInput = {
  mailboxEmail: string;
  displayName: string;
  replyTo?: string;
  recipientEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  idempotencyKey: string;
};

export type EmailSendResult = {
  externalMessageId: string;
  accepted: boolean;
  raw: Record<string, unknown>;
};

export type EmailReplyLookup = {
  recipientEmail: string;
  sentAt: string;
};

export type EmailReplyResult = {
  replied: boolean;
  messageId?: string;
  receivedAt?: string;
};

export interface EmailProvider {
  readonly provider: EmailProviderName;
  send(input: EmailSendInput): Promise<EmailSendResult>;
  findReply(input: EmailReplyLookup): Promise<EmailReplyResult>;
}
