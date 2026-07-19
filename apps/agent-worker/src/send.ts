import { hashContent } from "@marlow/agent";
import { ApolloMcpProvider, type ApolloProvider } from "@marlow/apollo";
import { decryptSecret, type EncryptedSecret } from "@marlow/database";
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
    subject: string;
    body: string;
    status: string;
  };
  campaigns: { status: string };
  organizations: { sending_settings: unknown };
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

export async function processSendJob(input: {
  client: SupabaseClient;
  sendId: string;
  encryptionKey: string;
  mcpUrl: string;
  mockApollo?: ApolloProvider;
}): Promise<void> {
  const { data, error } = await input.client
    .from("email_sends")
    .select(
      "*, approvals(*), outreach_drafts(recipient_email,sending_mailbox_id,subject,body,status), campaigns(status), organizations(sending_settings)",
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
  if (send.campaigns.status === "PAUSED") throw new Error("CAMPAIGN_PAUSED");
  if (
    approval.recipient_email.toLowerCase() !== draft.recipient_email.toLowerCase() ||
    approval.sending_mailbox_id !== draft.sending_mailbox_id ||
    approval.subject_hash !== hashContent(draft.subject) ||
    approval.body_hash !== hashContent(draft.body) ||
    send.recipient_email.toLowerCase() !== draft.recipient_email.toLowerCase() ||
    send.subject !== draft.subject ||
    send.body !== draft.body
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
    input.mockApollo ??
    (await loadApollo(input.client, send.organization_id, input.encryptionKey, input.mcpUrl));
  let sendInvoked = false;
  try {
    const mailboxes = await apollo.listMailboxes();
    const mailbox = mailboxes.find((candidate) => candidate.id === send.sending_mailbox_id);
    if (!mailbox || mailbox.status !== "available") throw new Error("APOLLO_MAILBOX_UNAVAILABLE");
    const claimed = await input.client
      .from("email_sends")
      .update({ status: "SENDING", attempts: Number(send.attempts) + 1 })
      .eq("id", send.id)
      .eq("status", "QUEUED")
      .select("id")
      .maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) return;
    sendInvoked = true;
    const result = await apollo.sendOneOffEmail({
      mailboxId: send.sending_mailbox_id,
      recipientEmail: send.recipient_email,
      subject: send.subject,
      body: send.body,
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
        subject: send.subject,
        body: send.body,
        externalMessageId: result.externalMessageId,
        idempotencyKey: send.idempotency_key,
      },
    });
    log("info", "Apollo confirmed one-off email send.", {
      organizationId: send.organization_id,
      campaignId: send.campaign_id,
      prospectId: send.prospect_id,
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
      "Apollo send failed or returned an ambiguous outcome; automatic retry is disabled.",
      {
        organizationId: send.organization_id,
        campaignId: send.campaign_id,
        prospectId: send.prospect_id,
        sendOutcome: "DELIVERY_UNKNOWN",
      },
    );
    throw new Error("DELIVERY_UNKNOWN_NO_AUTOMATIC_RETRY", { cause: sendError });
  } finally {
    await apollo.disconnect();
  }
}
