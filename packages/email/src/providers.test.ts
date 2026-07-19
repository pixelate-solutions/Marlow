import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMimeMessage, GmailEmailProvider, MicrosoftEmailProvider } from "./providers";

const input = {
  mailboxEmail: "joey@example.com",
  displayName: "Joey Morrison",
  replyTo: "replies@example.com",
  recipientEmail: "maya@example.com",
  subject: "Operations update",
  textBody: "Hello Maya\n\nJoey",
  htmlBody: "<div>Hello Maya</div><br><div>Joey</div>",
  idempotencyKey: "send-123",
};

describe("email providers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds a deterministic multipart Gmail message", () => {
    const message = buildMimeMessage(input);
    expect(message).toContain('From: "Joey Morrison" <joey@example.com>');
    expect(message).toContain("Reply-To: replies@example.com");
    expect(message).toContain("X-Marlow-Send-Id: send-123");
    expect(message).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it("rejects header injection", () => {
    expect(() => buildMimeMessage({ ...input, subject: "Hello\r\nBcc: bad@example.com" })).toThrow(
      "Subject contains an invalid line break.",
    );
  });

  it("sends through the Gmail API and returns the provider message id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "gmail-message-1", threadId: "thread-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await new GmailEmailProvider("token").send(input);
    expect(result.externalMessageId).toBe("gmail-message-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("detects a Gmail reply using sender and send time metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "gmail-reply-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await new GmailEmailProvider("token").findReply({
      recipientEmail: "maya@example.com",
      sentAt: "2026-07-12T12:00:00.000Z",
    });
    expect(result).toEqual({ replied: true, messageId: "gmail-reply-1" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("from:maya@example.com after:1783857600");
    expect(url.searchParams.get("includeSpamTrash")).toBe("true");
  });

  it("sends through Microsoft Graph and records accepted status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 202,
      }),
    );
    const result = await new MicrosoftEmailProvider("token").send(input);
    expect(result.accepted).toBe(true);
    expect(result.externalMessageId).toBe("microsoft-accepted:send-123");
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({
      message: { replyTo: [{ emailAddress: { address: "replies@example.com" } }] },
    });
  });

  it("detects an Outlook reply without requesting message bodies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [{ id: "outlook-reply-1", receivedDateTime: "2026-07-13T09:00:00.000Z" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await new MicrosoftEmailProvider("token").findReply({
      recipientEmail: "maya@example.com",
      sentAt: "2026-07-12T12:00:00.000Z",
    });
    expect(result).toEqual({
      replied: true,
      messageId: "outlook-reply-1",
      receivedAt: "2026-07-13T09:00:00.000Z",
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("$select")).toBe("id,receivedDateTime,from");
    expect(url.searchParams.get("$filter")).toContain(
      "from/emailAddress/address eq 'maya@example.com'",
    );
  });
});
