import { randomBytes } from "node:crypto";
import { AppError } from "@marlow/shared";
import { hashContent } from "@marlow/agent";
import { getApolloProvider } from "./apollo";
import type { AuthContext } from "./auth";
import { isDemoMode } from "./auth";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

const demoSends = new Map<string, { sendId: string; externalMessageId: string; status: "SENT" }>();

function rpcError(error: { message: string }): AppError {
  const code = error.message.match(
    /(AUTHENTICATION_REQUIRED|INSUFFICIENT_PERMISSION|PROSPECT_SUPPRESSED|APPROVAL_EXPIRED|APPROVAL_MISMATCH|DAILY_LIMIT_REACHED|OUTSIDE_SENDING_WINDOW|DUPLICATE_SEND_PREVENTED)/,
  )?.[1];
  if (code === "PROSPECT_SUPPRESSED")
    return new AppError(code, "This prospect is suppressed and cannot be contacted.", 409);
  if (code === "DAILY_LIMIT_REACHED")
    return new AppError(code, "The applicable daily send limit has been reached.", 409);
  if (code === "OUTSIDE_SENDING_WINDOW")
    return new AppError(
      code,
      "This organization is outside its allowed sending schedule or quiet hours.",
      409,
    );
  if (code === "INSUFFICIENT_PERMISSION")
    return new AppError(code, "Your role cannot send this draft.", 403);
  if (code === "AUTHENTICATION_REQUIRED") return new AppError(code, "Sign in is required.", 401);
  return new AppError(
    "APPROVAL_MISMATCH",
    "The exact draft, recipient, mailbox, or campaign state is no longer approvable.",
    409,
  );
}

export async function approveAndSend(input: {
  auth: AuthContext;
  draftId: string;
  mailboxId: string;
  idempotencyKey: string;
}): Promise<{
  sendId: string;
  externalMessageId?: string;
  status: string;
  duplicate: boolean;
  message: string;
}> {
  if (isDemoMode()) {
    const existing = demoSends.get(input.idempotencyKey);
    if (existing)
      return {
        ...existing,
        duplicate: true,
        message: "Duplicate click prevented; the demo email was already confirmed.",
      };
    const provider = await getApolloProvider(input.auth.organizationId);
    const result = await provider.sendOneOffEmail({
      mailboxId: input.mailboxId,
      recipientEmail: "maya@acme.example",
      subject: "Scaling operations",
      body: "Deterministic demo email. No external message was sent.",
      idempotencyKey: input.idempotencyKey,
    });
    const send = {
      sendId: `demo-send-${demoSends.size + 1}`,
      externalMessageId: result.externalMessageId,
      status: "SENT" as const,
    };
    demoSends.set(input.idempotencyKey, send);
    return {
      ...send,
      duplicate: false,
      message: "Demo send confirmed. No external email was sent.",
    };
  }

  const apollo = await getApolloProvider(input.auth.organizationId);
  let sendInvoked = false;
  try {
    const mailboxes = await apollo.listMailboxes();
    const mailbox = mailboxes.find((candidate) => candidate.id === input.mailboxId);
    if (!mailbox || mailbox.status !== "available") {
      throw new AppError(
        "APPROVAL_MISMATCH",
        "The selected Apollo mailbox is no longer available.",
        409,
      );
    }

    const supabase = await createSupabaseServerClient();
    const nonceHash = hashContent(randomBytes(32).toString("base64url"));
    const { data: reservation, error: reserveError } = await supabase.rpc("prepare_approved_send", {
      p_organization_id: input.auth.organizationId,
      p_user_id: input.auth.userId,
      p_draft_id: input.draftId,
      p_mailbox_id: input.mailboxId,
      p_idempotency_key: input.idempotencyKey,
      p_nonce_hash: nonceHash,
      p_ttl_seconds: 300,
      p_provider_mailbox_limit: mailbox.dailyLimit ?? null,
    });
    if (reserveError) throw rpcError(reserveError);
    const reserved = reservation as { sendId: string; status: string; duplicate: boolean };
    const admin = createSupabaseAdminClient();
    const { data: send, error: loadError } = await admin
      .from("email_sends")
      .select(
        "*,approvals(*),outreach_drafts(subject,body,recipient_email,sending_mailbox_id,status),campaigns(status)",
      )
      .eq("id", reserved.sendId)
      .eq("organization_id", input.auth.organizationId)
      .single();
    if (loadError) throw new Error(loadError.message);
    if (send.draft_id !== input.draftId || send.sending_mailbox_id !== input.mailboxId) {
      throw new AppError(
        "CONFLICT",
        "That idempotency key belongs to a different approved send.",
        409,
      );
    }
    if (send.status === "SENT")
      return {
        sendId: send.id,
        externalMessageId: send.external_message_id,
        status: "SENT",
        duplicate: true,
        message: "Duplicate send prevented; Apollo already confirmed this email.",
      };
    if (send.status === "SENDING")
      return {
        sendId: send.id,
        status: "SENDING",
        duplicate: true,
        message: "This exact send is already in progress.",
      };
    if (send.status !== "QUEUED")
      throw new AppError("APPROVAL_MISMATCH", "This send can no longer be claimed.", 409);
    const approval = Array.isArray(send.approvals) ? send.approvals[0] : send.approvals;
    const draft = Array.isArray(send.outreach_drafts)
      ? send.outreach_drafts[0]
      : send.outreach_drafts;
    const campaign = Array.isArray(send.campaigns) ? send.campaigns[0] : send.campaigns;
    if (
      !approval ||
      !draft ||
      !campaign ||
      !approval.consumed_at ||
      new Date(approval.expires_at) <= new Date()
    )
      throw new AppError("APPROVAL_EXPIRED", "Approval expired before the send could begin.", 409);
    if (["PAUSED", "FAILED", "COMPLETED"].includes(campaign.status))
      throw new AppError("APPROVAL_MISMATCH", "Campaign is not active.", 409);
    if (
      approval.subject_hash !== hashContent(draft.subject) ||
      approval.body_hash !== hashContent(draft.body) ||
      approval.recipient_email.toLowerCase() !== draft.recipient_email.toLowerCase() ||
      approval.sending_mailbox_id !== draft.sending_mailbox_id
    )
      throw new AppError(
        "APPROVAL_MISMATCH",
        "Draft, recipient, or mailbox changed after approval.",
        409,
      );
    const domain = String(send.recipient_email).split("@")[1] ?? "";
    const suppression = await admin.rpc("is_recipient_suppressed", {
      p_organization_id: input.auth.organizationId,
      p_email: send.recipient_email,
      p_domain: domain,
      p_apollo_person_id: null,
      p_apollo_contact_id: null,
    });
    if (suppression.error) throw new Error(suppression.error.message);
    if (suppression.data)
      throw new AppError("PROSPECT_SUPPRESSED", "This recipient is suppressed.", 409);
    const claim = await admin
      .from("email_sends")
      .update({ status: "SENDING", attempts: Number(send.attempts) + 1 })
      .eq("id", send.id)
      .eq("status", "QUEUED")
      .select("id")
      .maybeSingle();
    if (claim.error) throw new Error(claim.error.message);
    if (!claim.data)
      return {
        sendId: send.id,
        status: "SENDING",
        duplicate: true,
        message: "This exact send is already in progress.",
      };
    sendInvoked = true;
    const result = await apollo.sendOneOffEmail({
      mailboxId: send.sending_mailbox_id,
      recipientEmail: send.recipient_email,
      subject: send.subject,
      body: send.body,
      idempotencyKey: send.idempotency_key,
    });
    const now = new Date().toISOString();
    const update = await admin
      .from("email_sends")
      .update({
        status: "SENT",
        external_message_id: result.externalMessageId,
        external_response: result.raw ?? {},
        sent_at: now,
      })
      .eq("id", send.id)
      .eq("status", "SENDING");
    if (update.error) throw new Error(update.error.message);
    await admin
      .from("outreach_drafts")
      .update({ status: "SENT", sent_at: now })
      .eq("id", send.draft_id);
    await admin
      .from("prospects")
      .update({ status: "SENT", previously_contacted_at: now })
      .eq("id", send.prospect_id);
    await admin.from("audit_events").insert({
      organization_id: input.auth.organizationId,
      actor_user_id: input.auth.userId,
      actor_type: "USER",
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
    return {
      sendId: send.id,
      externalMessageId: result.externalMessageId,
      status: "SENT",
      duplicate: reserved.duplicate,
      message: "Apollo confirmed the email was sent exactly once.",
    };
  } catch (error) {
    if (!sendInvoked) throw error;
    const admin = createSupabaseAdminClient();
    await admin
      .from("email_sends")
      .update({
        status: "DELIVERY_UNKNOWN",
        last_error: error instanceof Error ? error.message : String(error),
      })
      .eq("organization_id", input.auth.organizationId)
      .eq("idempotency_key", input.idempotencyKey)
      .eq("status", "SENDING");
    throw new AppError(
      "WORKER_UNAVAILABLE",
      "Apollo did not return a definitive result. The send is marked delivery-unknown and will not be retried automatically.",
      503,
    );
  } finally {
    await apollo.disconnect();
  }
}
