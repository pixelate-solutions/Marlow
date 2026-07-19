import { hashApprovedBody, hashContent } from "@marlow/agent";
import { ApolloMcpProvider, type ApolloProvider } from "@marlow/apollo";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@marlow/database";
import {
  composeEmailContent,
  GmailEmailProvider,
  MicrosoftEmailProvider,
  refreshAccessToken,
  type EmailProvider,
  type EmailProviderName,
  type OAuthTokenSet,
} from "@marlow/email";
import { evaluateSendingWindow, sendingSettingsSchema } from "@marlow/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./logger";

type SendRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  prospect_id: string;
  draft_id: string;
  sending_mailbox_id: string;
  sending_provider: "APOLLO" | EmailProviderName;
  sender_email: string;
  sender_name: string;
  signature_html: string;
  signature_text: string;
  compliance_footer_text: string;
  recipient_email: string;
  subject: string;
  body: string;
  idempotency_key: string;
  status: string;
  attempts: number;
  approvals: {
    id: string;
    recipient_email: string;
    sending_mailbox_id: string;
    subject_hash: string;
    body_hash: string;
    expires_at: string;
    consumed_at: string | null;
  };
  outreach_drafts: {
    recipient_email: string;
    sending_mailbox_id: string;
    sending_provider: "APOLLO" | EmailProviderName;
    sender_email: string;
    sender_name: string;
    signature_html: string;
    signature_text: string;
    compliance_footer_text: string;
    subject: string;
    body: string;
    status: string;
    draft_kind: "INITIAL" | "FOLLOW_UP";
    parent_email_send_id: string | null;
  };
  campaigns: { status: string };
  organizations: { sending_settings: unknown };
};

type OAuthConfiguration = {
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  microsoftTenant?: string;
};

async function loadApollo(
  client: SupabaseClient,
  organizationId: string,
  encryptionKey: string,
  mcpUrl: string,
): Promise<ApolloProvider> {
  const { data, error } = await client
    .from("integrations")
    .select("id, status, integration_credentials(encrypted_payload,iv,auth_tag,key_version)")
    .eq("organization_id", organizationId)
    .eq("provider", "APOLLO")
    .single();
  if (error || data.status !== "CONNECTED") throw new Error("APOLLO_NOT_CONNECTED");
  const raw = Array.isArray(data.integration_credentials)
    ? data.integration_credentials[0]
    : data.integration_credentials;
  if (!raw) throw new Error("APOLLO_NOT_CONNECTED");
  const secret: EncryptedSecret = {
    ciphertext: String(raw.encrypted_payload),
    iv: String(raw.iv),
    authTag: String(raw.auth_tag),
    keyVersion: Number(raw.key_version),
  };
  const tokens = JSON.parse(decryptSecret(secret, encryptionKey)) as { accessToken?: string };
  if (!tokens.accessToken) throw new Error("APOLLO_REAUTHORIZATION_REQUIRED");
  return new ApolloMcpProvider({ url: mcpUrl, accessToken: tokens.accessToken });
}

async function loadEmailProvider(input: {
  client: SupabaseClient;
  organizationId: string;
  mailboxId: string;
  encryptionKey: string;
  oauth: OAuthConfiguration;
}): Promise<{ provider: EmailProvider; email: string; displayName: string; replyTo?: string }> {
  const { data: mailbox, error: mailboxError } = await input.client
    .from("sending_mailboxes")
    .select("id,integration_id,provider,email,display_name,reply_to,status")
    .eq("id", input.mailboxId)
    .eq("organization_id", input.organizationId)
    .single();
  if (mailboxError || mailbox.status !== "AVAILABLE") throw new Error("MAILBOX_NOT_CONNECTED");
  const { data: integration, error: integrationError } = await input.client
    .from("integrations")
    .select(
      "id,status,integration_credentials(encrypted_payload,iv,auth_tag,key_version,expires_at)",
    )
    .eq("id", mailbox.integration_id)
    .eq("organization_id", input.organizationId)
    .single();
  if (integrationError || integration.status !== "CONNECTED")
    throw new Error("MAILBOX_REAUTHORIZATION_REQUIRED");
  const raw = Array.isArray(integration.integration_credentials)
    ? integration.integration_credentials[0]
    : integration.integration_credentials;
  if (!raw) throw new Error("MAILBOX_NOT_CONNECTED");
  const encrypted: EncryptedSecret = {
    ciphertext: String(raw.encrypted_payload),
    iv: String(raw.iv),
    authTag: String(raw.auth_tag),
    keyVersion: Number(raw.key_version),
  };
  const providerName = mailbox.provider as EmailProviderName;
  let tokens = JSON.parse(decryptSecret(encrypted, input.encryptionKey)) as OAuthTokenSet;
  const expiresSoon =
    !raw.expires_at || new Date(String(raw.expires_at)).getTime() <= Date.now() + 60_000;
  if (expiresSoon) {
    if (!tokens.refreshToken) throw new Error("MAILBOX_REAUTHORIZATION_REQUIRED");
    const clientId =
      providerName === "GMAIL" ? input.oauth.googleClientId : input.oauth.microsoftClientId;
    const clientSecret =
      providerName === "GMAIL" ? input.oauth.googleClientSecret : input.oauth.microsoftClientSecret;
    if (!clientId || !clientSecret) throw new Error("MAILBOX_REAUTHORIZATION_REQUIRED");
    const refreshed = await refreshAccessToken({
      provider: providerName,
      clientId,
      clientSecret,
      refreshToken: tokens.refreshToken,
      ...(providerName === "MICROSOFT" && input.oauth.microsoftTenant
        ? { tenant: input.oauth.microsoftTenant }
        : {}),
    });
    tokens = {
      ...tokens,
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    };
    const stored = encryptSecret(JSON.stringify(tokens), input.encryptionKey);
    const update = await input.client
      .from("integration_credentials")
      .update({
        encrypted_payload: stored.ciphertext,
        iv: stored.iv,
        auth_tag: stored.authTag,
        key_version: stored.keyVersion,
        expires_at: refreshed.expiresIn
          ? new Date(Date.now() + refreshed.expiresIn * 1_000).toISOString()
          : null,
      })
      .eq("integration_id", integration.id);
    if (update.error) throw new Error(update.error.message);
  }
  if (!tokens.accessToken) throw new Error("MAILBOX_REAUTHORIZATION_REQUIRED");
  return {
    provider:
      providerName === "GMAIL"
        ? new GmailEmailProvider(tokens.accessToken)
        : new MicrosoftEmailProvider(tokens.accessToken),
    email: String(mailbox.email),
    displayName: String(mailbox.display_name),
    ...(mailbox.reply_to ? { replyTo: String(mailbox.reply_to) } : {}),
  };
}

export async function processSendJob(input: {
  client: SupabaseClient;
  sendId: string;
  encryptionKey: string;
  mcpUrl: string;
  oauth?: OAuthConfiguration;
  mockApollo?: ApolloProvider;
}): Promise<void> {
  const { data, error } = await input.client
    .from("email_sends")
    .select(
      "*, approvals(*), outreach_drafts!email_sends_draft_id_fkey(recipient_email,sending_mailbox_id,sending_provider,sender_email,sender_name,signature_html,signature_text,compliance_footer_text,subject,body,status,draft_kind,parent_email_send_id), campaigns(status), organizations(sending_settings)",
    )
    .eq("id", input.sendId)
    .single();
  if (error) throw new Error(error.message);
  const send = data as unknown as SendRow;
  if (send.status === "SENT") return;
  if (send.status !== "QUEUED")
    throw new Error(`Send is not claimable from status ${send.status}.`);
  const approval = send.approvals;
  const draft = send.outreach_drafts;
  if (!approval.consumed_at || new Date(approval.expires_at) <= new Date())
    throw new Error("APPROVAL_EXPIRED");
  if (["PAUSED", "FAILED", "COMPLETED"].includes(send.campaigns.status))
    throw new Error("CAMPAIGN_PAUSED");
  if (
    approval.recipient_email.toLowerCase() !== draft.recipient_email.toLowerCase() ||
    approval.sending_mailbox_id !== draft.sending_mailbox_id ||
    approval.subject_hash !== hashContent(draft.subject) ||
    approval.body_hash !==
      hashApprovedBody({
        body: draft.body,
        signatureText: draft.signature_text,
        signatureHtml: draft.signature_html,
        complianceFooterText: draft.compliance_footer_text,
      }) ||
    send.recipient_email.toLowerCase() !== draft.recipient_email.toLowerCase() ||
    send.subject !== draft.subject ||
    send.body !== draft.body ||
    send.sending_provider !== draft.sending_provider ||
    send.sender_email !== draft.sender_email ||
    send.sender_name !== draft.sender_name ||
    send.signature_html !== draft.signature_html ||
    send.signature_text !== draft.signature_text ||
    send.compliance_footer_text !== draft.compliance_footer_text
  )
    throw new Error("APPROVAL_MISMATCH");
  const domain = send.recipient_email.split("@")[1] ?? "";
  const suppression = await input.client.rpc("is_recipient_suppressed", {
    p_organization_id: send.organization_id,
    p_email: send.recipient_email,
    p_domain: domain,
    p_apollo_person_id: null,
    p_apollo_contact_id: null,
  });
  if (suppression.error) throw new Error(suppression.error.message);
  if (suppression.data) throw new Error("PROSPECT_SUPPRESSED");
  const settings = sendingSettingsSchema.safeParse(send.organizations.sending_settings);
  if (!settings.success || !evaluateSendingWindow(settings.data).allowed)
    throw new Error("OUTSIDE_SENDING_WINDOW");
  const apollo =
    send.sending_provider === "APOLLO"
      ? (input.mockApollo ??
        (await loadApollo(input.client, send.organization_id, input.encryptionKey, input.mcpUrl)))
      : null;
  const direct =
    send.sending_provider === "APOLLO"
      ? null
      : await loadEmailProvider({
          client: input.client,
          organizationId: send.organization_id,
          mailboxId: send.sending_mailbox_id,
          encryptionKey: input.encryptionKey,
          oauth: input.oauth ?? {},
        });
  if (
    direct &&
    (direct.email.toLowerCase() !== send.sender_email.toLowerCase() ||
      !send.sender_email ||
      !send.sender_name)
  )
    throw new Error("APPROVAL_MISMATCH");
  if (direct && draft.draft_kind === "FOLLOW_UP" && draft.parent_email_send_id) {
    const { data: originalSend, error: originalSendError } = await input.client
      .from("email_sends")
      .select("id,recipient_email,sent_at,created_at")
      .eq("id", draft.parent_email_send_id)
      .eq("organization_id", send.organization_id)
      .single();
    if (originalSendError) throw new Error(originalSendError.message);
    const reply = await direct.provider.findReply({
      recipientEmail: originalSend.recipient_email,
      sentAt: originalSend.sent_at ?? originalSend.created_at,
    });
    if (reply.replied) {
      const now = new Date().toISOString();
      await Promise.all([
        input.client
          .from("email_sends")
          .update({ status: "FAILED", last_error: "RECIPIENT_REPLIED" })
          .eq("id", send.id)
          .eq("status", "QUEUED"),
        input.client.from("outreach_drafts").update({ status: "SKIPPED" }).eq("id", send.draft_id),
      ]);
      await input.client
        .from("email_follow_up_monitors")
        .update({
          status: "REPLIED",
          reply_message_id: reply.messageId ?? null,
          reply_detected_at: reply.receivedAt ?? now,
          last_checked_at: now,
          last_error: null,
          locked_at: null,
          locked_by: null,
        })
        .eq("follow_up_draft_id", send.draft_id);
      await input.client.from("audit_events").insert({
        organization_id: send.organization_id,
        actor_type: "SYSTEM",
        action: "FOLLOW_UP_BLOCKED_BY_REPLY",
        entity_type: "outreach_draft",
        entity_id: send.draft_id,
        campaign_id: send.campaign_id,
        prospect_id: send.prospect_id,
        immutable_data: {
          originalSendId: originalSend.id,
          replyMessageId: reply.messageId ?? null,
          provider: direct.provider.provider,
        },
      });
      log("info", "Follow-up send stopped because the recipient replied.", {
        organizationId: send.organization_id,
        campaignId: send.campaign_id,
        prospectId: send.prospect_id,
        provider: send.sending_provider,
        sendOutcome: "RECIPIENT_REPLIED",
      });
      return;
    }
  }
  if (apollo) {
    const mailboxes = await apollo.listMailboxes();
    const mailbox = mailboxes.find((candidate) => candidate.id === send.sending_mailbox_id);
    if (!mailbox || mailbox.status !== "available") throw new Error("APOLLO_MAILBOX_UNAVAILABLE");
  }
  let sendInvoked = false;
  try {
    const claimed = await input.client
      .from("email_sends")
      .update({ status: "SENDING", attempts: Number(send.attempts) + 1 })
      .eq("id", send.id)
      .eq("status", "QUEUED")
      .select("id")
      .maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) return;
    const content = composeEmailContent({
      body: send.body,
      signatureHtml: send.signature_html,
      signatureText: send.signature_text,
      complianceFooter: send.compliance_footer_text,
    });
    sendInvoked = true;
    const result = direct
      ? await direct.provider.send({
          mailboxEmail: send.sender_email,
          displayName: send.sender_name || direct.displayName,
          ...(direct.replyTo ? { replyTo: direct.replyTo } : {}),
          recipientEmail: send.recipient_email,
          subject: send.subject,
          textBody: content.text,
          htmlBody: content.html,
          idempotencyKey: send.idempotency_key,
        })
      : await apollo!.sendOneOffEmail({
          mailboxId: send.sending_mailbox_id,
          recipientEmail: send.recipient_email,
          subject: send.subject,
          body: content.text,
          idempotencyKey: send.idempotency_key,
        });
    const now = new Date().toISOString();
    const completed = await input.client
      .from("email_sends")
      .update({
        status: "SENT",
        external_message_id: result.externalMessageId,
        external_response: result.raw ?? {},
        sent_at: now,
      })
      .eq("id", send.id)
      .eq("status", "SENDING");
    if (completed.error) throw new Error(completed.error.message);
    await input.client
      .from("outreach_drafts")
      .update({ status: "SENT", sent_at: now })
      .eq("id", send.draft_id);
    await input.client
      .from("prospects")
      .update({ status: "SENT", previously_contacted_at: now })
      .eq("id", send.prospect_id);
    await input.client.from("audit_events").insert({
      organization_id: send.organization_id,
      actor_type: "WORKER",
      action: "EMAIL_SENT",
      entity_type: "email_send",
      entity_id: send.id,
      campaign_id: send.campaign_id,
      prospect_id: send.prospect_id,
      immutable_data: {
        recipient: send.recipient_email,
        mailboxId: send.sending_mailbox_id,
        provider: send.sending_provider,
        senderEmail: send.sender_email,
        subject: send.subject,
        approvedBodyHash: approval.body_hash,
        externalMessageId: result.externalMessageId,
        idempotencyKey: send.idempotency_key,
      },
    });
    log("info", "Connected mailbox confirmed one email send.", {
      organizationId: send.organization_id,
      campaignId: send.campaign_id,
      prospectId: send.prospect_id,
      provider: send.sending_provider,
      sendOutcome: "SENT",
    });
  } catch (sendError) {
    if (!sendInvoked) throw sendError;
    await input.client
      .from("email_sends")
      .update({
        status: "DELIVERY_UNKNOWN",
        last_error: sendError instanceof Error ? sendError.message : String(sendError),
      })
      .eq("id", send.id);
    log(
      "error",
      "Email send failed or returned an ambiguous outcome; automatic retry is disabled.",
      {
        organizationId: send.organization_id,
        campaignId: send.campaign_id,
        prospectId: send.prospect_id,
        provider: send.sending_provider,
        sendOutcome: "DELIVERY_UNKNOWN",
      },
    );
    throw new Error("DELIVERY_UNKNOWN_NO_AUTOMATIC_RETRY", { cause: sendError });
  } finally {
    await apollo?.disconnect();
  }
}
