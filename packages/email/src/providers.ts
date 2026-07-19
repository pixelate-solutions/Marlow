import { createHash } from "node:crypto";
import { htmlToPlainText } from "./content";
import type { EmailProvider, EmailSendInput, EmailSendResult, ProviderMailbox } from "./types";

function cleanHeader(value: string, field: string): string {
  if (/\r|\n/.test(value)) throw new Error(`${field} contains an invalid line break.`);
  return value.trim();
}

function quotedDisplayName(value: string): string {
  return `"${cleanHeader(value, "Display name").replaceAll(/["\\]/g, "\\$&")}"`;
}

export function buildMimeMessage(input: EmailSendInput): string {
  const boundary = `marlow_${createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 24)}`;
  const subject = `=?UTF-8?B?${Buffer.from(cleanHeader(input.subject, "Subject"), "utf8").toString("base64")}?=`;
  const from = `${quotedDisplayName(input.displayName)} <${cleanHeader(input.mailboxEmail, "From")}>`;
  const headers = [
    `From: ${from}`,
    `To: ${cleanHeader(input.recipientEmail, "Recipient")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `X-Marlow-Send-Id: ${cleanHeader(input.idempotencyKey, "Send ID")}`,
    ...(input.replyTo ? [`Reply-To: ${cleanHeader(input.replyTo, "Reply-To")}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.textBody,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.htmlBody,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function providerError(response: Response, provider: string): Promise<never> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string } | string;
  };
  const code = typeof payload.error === "object" ? payload.error.code : undefined;
  if (response.status === 401 || response.status === 403)
    throw new Error(`${provider.toUpperCase()}_REAUTHORIZATION_REQUIRED`);
  if (response.status === 429) throw new Error(`${provider.toUpperCase()}_RATE_LIMITED`);
  throw new Error(
    code ? `${provider.toUpperCase()}_${code}` : `${provider.toUpperCase()}_REQUEST_FAILED`,
  );
}

export async function listGmailMailboxes(accessToken: string): Promise<ProviderMailbox[]> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) return providerError(response, "gmail");
  const payload = (await response.json()) as {
    sendAs?: Array<{
      sendAsEmail?: string;
      displayName?: string;
      replyToAddress?: string;
      signature?: string;
      isDefault?: boolean;
      isPrimary?: boolean;
      verificationStatus?: string;
    }>;
  };
  return (payload.sendAs ?? []).flatMap((item) => {
    if (!item.sendAsEmail) return [];
    const signatureHtml = item.signature ?? "";
    return [
      {
        externalId: item.sendAsEmail.toLowerCase(),
        email: item.sendAsEmail.toLowerCase(),
        displayName: item.displayName?.trim() || item.sendAsEmail,
        ...(item.replyToAddress ? { replyTo: item.replyToAddress } : {}),
        signatureHtml,
        signatureText: htmlToPlainText(signatureHtml),
        isDefault: Boolean(item.isDefault),
        isPrimary: Boolean(item.isPrimary),
        available: Boolean(item.isPrimary || item.verificationStatus === "accepted"),
      },
    ];
  });
}

export async function getMicrosoftMailbox(accessToken: string): Promise<ProviderMailbox> {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok) return providerError(response, "microsoft");
  const payload = (await response.json()) as {
    id?: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
  const email = payload.mail ?? payload.userPrincipalName;
  if (!payload.id || !email) throw new Error("MICROSOFT_MAILBOX_IDENTITY_MISSING");
  return {
    externalId: payload.id,
    email: email.toLowerCase(),
    displayName: payload.displayName?.trim() || email,
    signatureHtml: "",
    signatureText: "",
    isDefault: true,
    isPrimary: true,
    available: true,
  };
}

export class GmailEmailProvider implements EmailProvider {
  readonly provider = "GMAIL" as const;

  constructor(private readonly accessToken: string) {}

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const raw = Buffer.from(buildMimeMessage(input), "utf8").toString("base64url");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) return providerError(response, "gmail");
    const payload = (await response.json()) as {
      id?: string;
      threadId?: string;
      labelIds?: string[];
    };
    if (!payload.id) throw new Error("GMAIL_SEND_RESPONSE_MISSING_ID");
    return {
      externalMessageId: payload.id,
      accepted: true,
      raw: {
        id: payload.id,
        ...(payload.threadId ? { threadId: payload.threadId } : {}),
        ...(payload.labelIds ? { labelIds: payload.labelIds } : {}),
      },
    };
  }
}

export class MicrosoftEmailProvider implements EmailProvider {
  readonly provider = "MICROSOFT" as const;

  constructor(private readonly accessToken: string) {}

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: "HTML", content: input.htmlBody },
          toRecipients: [{ emailAddress: { address: input.recipientEmail } }],
          ...(input.replyTo ? { replyTo: [{ emailAddress: { address: input.replyTo } }] } : {}),
          internetMessageHeaders: [{ name: "X-Marlow-Send-Id", value: input.idempotencyKey }],
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) return providerError(response, "microsoft");
    if (response.status !== 202) throw new Error("MICROSOFT_SEND_RESPONSE_NOT_ACCEPTED");
    return {
      externalMessageId: `microsoft-accepted:${input.idempotencyKey}`,
      accepted: true,
      raw: { status: response.status, accepted: true },
    };
  }
}
