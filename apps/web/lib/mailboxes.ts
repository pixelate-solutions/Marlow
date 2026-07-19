import {
  GmailEmailProvider,
  MicrosoftEmailProvider,
  getMicrosoftMailbox,
  listGmailMailboxes,
  refreshAccessToken,
  textToHtml,
  type EmailProvider,
  type EmailProviderName,
  type OAuthTokenSet,
  type ProviderMailbox,
} from "@marlow/email";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@marlow/database";
import { AppError } from "@marlow/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase/admin";

export type SendingMailbox = {
  id: string;
  provider: EmailProviderName;
  email: string;
  displayName: string;
  replyTo: string;
  signatureHtml: string;
  signatureText: string;
  signatureSource: "PROVIDER" | "MANUAL" | "NONE";
  isDefault: boolean;
  isPrimary: boolean;
  status: "AVAILABLE" | "UNAVAILABLE" | "REAUTHORIZATION_REQUIRED";
  lastSyncedAt: string | null;
};

type StoredTokens = OAuthTokenSet & { provider: EmailProviderName };

type CredentialRow = {
  encrypted_payload: string;
  iv: string;
  auth_tag: string;
  key_version: number;
  expires_at: string | null;
};

export function providerFromSlug(slug: string): EmailProviderName | null {
  if (slug === "google") return "GMAIL";
  if (slug === "microsoft") return "MICROSOFT";
  return null;
}

export function providerSlug(provider: EmailProviderName): "google" | "microsoft" {
  return provider === "GMAIL" ? "google" : "microsoft";
}

export function mailboxOAuthConfig(provider: EmailProviderName) {
  const isGoogle = provider === "GMAIL";
  const clientId = isGoogle
    ? process.env.GOOGLE_OAUTH_CLIENT_ID
    : process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = isGoogle
    ? process.env.GOOGLE_OAUTH_CLIENT_SECRET
    : process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  const redirectUri = isGoogle
    ? process.env.GOOGLE_OAUTH_REDIRECT_URI
    : process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  return {
    clientId,
    clientSecret,
    redirectUri,
    tenant: process.env.MICROSOFT_OAUTH_TENANT ?? "common",
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

function encryptedSecret(row: CredentialRow): EncryptedSecret {
  return {
    ciphertext: row.encrypted_payload,
    iv: row.iv,
    authTag: row.auth_tag,
    keyVersion: row.key_version,
  };
}

function mailboxFromRow(row: Record<string, unknown>): SendingMailbox {
  return {
    id: String(row.id),
    provider: row.provider as EmailProviderName,
    email: String(row.email),
    displayName: String(row.display_name),
    replyTo: row.reply_to ? String(row.reply_to) : "",
    signatureHtml: String(row.signature_html ?? ""),
    signatureText: String(row.signature_text ?? ""),
    signatureSource: row.signature_source as SendingMailbox["signatureSource"],
    isDefault: Boolean(row.is_default),
    isPrimary: Boolean(row.is_primary),
    status: row.status as SendingMailbox["status"],
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
  };
}

export async function getSendingMailboxes(organizationId: string): Promise<SendingMailbox[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("sending_mailboxes")
    .select(
      "id,provider,email,display_name,reply_to,signature_html,signature_text,signature_source,is_default,is_primary,status,last_synced_at",
    )
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mailboxFromRow(row));
}

export async function getDefaultSendingMailbox(
  organizationId: string,
): Promise<SendingMailbox | null> {
  const mailboxes = await getSendingMailboxes(organizationId);
  return (
    mailboxes.find((mailbox) => mailbox.isDefault && mailbox.status === "AVAILABLE") ??
    mailboxes.find((mailbox) => mailbox.status === "AVAILABLE") ??
    null
  );
}

async function markReauthorizationRequired(
  admin: SupabaseClient,
  integrationId: string,
): Promise<void> {
  await Promise.all([
    admin
      .from("integrations")
      .update({ status: "REAUTHORIZATION_REQUIRED" })
      .eq("id", integrationId),
    admin
      .from("sending_mailboxes")
      .update({ status: "REAUTHORIZATION_REQUIRED" })
      .eq("integration_id", integrationId),
  ]);
}

async function loadAccessToken(input: {
  admin: SupabaseClient;
  integrationId: string;
  provider: EmailProviderName;
  credential: CredentialRow;
}): Promise<string> {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is not configured.");
  const tokens = JSON.parse(
    decryptSecret(encryptedSecret(input.credential), encryptionKey),
  ) as StoredTokens;
  const expiresAt = input.credential.expires_at
    ? new Date(input.credential.expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  if (tokens.accessToken && expiresAt > Date.now() + 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) {
    await markReauthorizationRequired(input.admin, input.integrationId);
    throw new AppError(
      "MAILBOX_REAUTHORIZATION_REQUIRED",
      "Reconnect this mailbox to continue sending.",
      409,
    );
  }
  const config = mailboxOAuthConfig(input.provider);
  if (!config.clientId || !config.clientSecret)
    throw new AppError(
      "MAILBOX_NOT_CONNECTED",
      "Mailbox OAuth is not configured by an administrator.",
      503,
    );
  try {
    const refreshed = await refreshAccessToken({
      provider: input.provider,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: tokens.refreshToken,
      tenant: config.tenant,
    });
    const merged: StoredTokens = {
      ...tokens,
      ...refreshed,
      provider: input.provider,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    };
    const encrypted = encryptSecret(JSON.stringify(merged), encryptionKey);
    const update = await input.admin
      .from("integration_credentials")
      .update({
        encrypted_payload: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion,
        expires_at: refreshed.expiresIn
          ? new Date(Date.now() + refreshed.expiresIn * 1_000).toISOString()
          : null,
      })
      .eq("integration_id", input.integrationId);
    if (update.error) throw new Error(update.error.message);
    return refreshed.accessToken;
  } catch (error) {
    await markReauthorizationRequired(input.admin, input.integrationId);
    if (error instanceof AppError) throw error;
    throw new AppError(
      "MAILBOX_REAUTHORIZATION_REQUIRED",
      "Reconnect this mailbox to continue sending.",
      409,
    );
  }
}

export async function syncProviderMailboxes(input: {
  organizationId: string;
  integrationId: string;
  provider: EmailProviderName;
}): Promise<SendingMailbox[]> {
  const admin = createSupabaseAdminClient();
  const { data: credential, error: credentialError } = await admin
    .from("integration_credentials")
    .select("encrypted_payload,iv,auth_tag,key_version,expires_at")
    .eq("integration_id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .single();
  if (credentialError) throw new Error(credentialError.message);
  const accessToken = await loadAccessToken({
    admin,
    integrationId: input.integrationId,
    provider: input.provider,
    credential,
  });
  const discovered: ProviderMailbox[] =
    input.provider === "GMAIL"
      ? await listGmailMailboxes(accessToken)
      : [await getMicrosoftMailbox(accessToken)];
  if (!discovered.some((mailbox) => mailbox.available))
    throw new AppError(
      "MAILBOX_PERMISSION_DENIED",
      "The provider did not return an available sending address.",
      409,
    );
  const { data: existing, error: existingError } = await admin
    .from("sending_mailboxes")
    .select("id,external_mailbox_id,signature_html,signature_text,signature_source,is_default")
    .eq("organization_id", input.organizationId)
    .eq("integration_id", input.integrationId);
  if (existingError) throw new Error(existingError.message);
  const currentByExternalId = new Map(
    (existing ?? []).map((row) => [String(row.external_mailbox_id), row]),
  );
  const { data: organizationDefault } = await admin
    .from("sending_mailboxes")
    .select("id,integration_id,external_mailbox_id")
    .eq("organization_id", input.organizationId)
    .eq("is_default", true)
    .maybeSingle();
  const availableDefault = discovered.find(
    (mailbox) =>
      mailbox.externalId === String(organizationDefault?.external_mailbox_id) && mailbox.available,
  );
  const preferredExternalId =
    organizationDefault?.integration_id === input.integrationId
      ? (availableDefault?.externalId ??
        discovered.find((mailbox) => mailbox.isDefault && mailbox.available)?.externalId ??
        discovered.find((mailbox) => mailbox.available)?.externalId)
      : !organizationDefault
        ? (discovered.find((mailbox) => mailbox.isDefault && mailbox.available)?.externalId ??
          discovered.find((mailbox) => mailbox.available)?.externalId)
        : undefined;
  await admin
    .from("sending_mailboxes")
    .update({ is_default: false })
    .eq("integration_id", input.integrationId);
  const now = new Date().toISOString();
  const rows = discovered.map((mailbox) => {
    const prior = currentByExternalId.get(mailbox.externalId);
    const manual = prior?.signature_source === "MANUAL";
    return {
      organization_id: input.organizationId,
      integration_id: input.integrationId,
      provider: input.provider,
      external_mailbox_id: mailbox.externalId,
      email: mailbox.email,
      display_name: mailbox.displayName,
      reply_to: mailbox.replyTo ?? null,
      signature_html: manual ? prior.signature_html : mailbox.signatureHtml,
      signature_text: manual ? prior.signature_text : mailbox.signatureText,
      signature_source: manual
        ? "MANUAL"
        : mailbox.signatureHtml || mailbox.signatureText
          ? "PROVIDER"
          : "NONE",
      is_default: mailbox.externalId === preferredExternalId,
      is_primary: mailbox.isPrimary,
      status: mailbox.available ? "AVAILABLE" : "UNAVAILABLE",
      metadata: { providerDefault: mailbox.isDefault },
      last_synced_at: now,
    };
  });
  const upsert = await admin
    .from("sending_mailboxes")
    .upsert(rows, { onConflict: "integration_id,external_mailbox_id" })
    .select("id,external_mailbox_id,is_default");
  if (upsert.error) throw new Error(upsert.error.message);
  const discoveredIds = new Set(discovered.map((mailbox) => mailbox.externalId));
  await Promise.all(
    (existing ?? [])
      .filter((row) => !discoveredIds.has(String(row.external_mailbox_id)))
      .map((row) =>
        admin.from("sending_mailboxes").update({ status: "UNAVAILABLE" }).eq("id", row.id),
      ),
  );
  const defaultRow = (upsert.data ?? []).find((row) => row.is_default);
  if (defaultRow) {
    const { data: organization } = await admin
      .from("organizations")
      .select("sending_settings")
      .eq("id", input.organizationId)
      .single();
    const settings = (organization?.sending_settings ?? {}) as Record<string, unknown>;
    await admin
      .from("organizations")
      .update({ sending_settings: { ...settings, defaultMailboxId: defaultRow.id } })
      .eq("id", input.organizationId);
  }
  await admin
    .from("integrations")
    .update({ status: "CONNECTED", last_verified_at: now })
    .eq("id", input.integrationId);
  return getSendingMailboxes(input.organizationId);
}

export async function getEmailProviderForMailbox(input: {
  organizationId: string;
  mailboxId: string;
}): Promise<{
  provider: EmailProvider;
  mailbox: SendingMailbox;
  dailyLimit: number | null;
}> {
  const admin = createSupabaseAdminClient();
  const { data: mailboxRow, error: mailboxError } = await admin
    .from("sending_mailboxes")
    .select(
      "id,integration_id,provider,email,display_name,reply_to,signature_html,signature_text,signature_source,is_default,is_primary,status,last_synced_at",
    )
    .eq("id", input.mailboxId)
    .eq("organization_id", input.organizationId)
    .single();
  if (mailboxError || mailboxRow.status !== "AVAILABLE")
    throw new AppError("MAILBOX_NOT_CONNECTED", "The selected mailbox is unavailable.", 409);
  const { data: integration, error: integrationError } = await admin
    .from("integrations")
    .select(
      "id,status,integration_credentials(encrypted_payload,iv,auth_tag,key_version,expires_at)",
    )
    .eq("id", mailboxRow.integration_id)
    .eq("organization_id", input.organizationId)
    .single();
  if (integrationError || integration.status !== "CONNECTED")
    throw new AppError(
      "MAILBOX_REAUTHORIZATION_REQUIRED",
      "Reconnect the selected mailbox to continue.",
      409,
    );
  const rawCredential = Array.isArray(integration.integration_credentials)
    ? integration.integration_credentials[0]
    : integration.integration_credentials;
  if (!rawCredential)
    throw new AppError("MAILBOX_NOT_CONNECTED", "Mailbox credentials are unavailable.", 409);
  const providerName = mailboxRow.provider as EmailProviderName;
  const accessToken = await loadAccessToken({
    admin,
    integrationId: integration.id,
    provider: providerName,
    credential: rawCredential,
  });
  return {
    provider:
      providerName === "GMAIL"
        ? new GmailEmailProvider(accessToken)
        : new MicrosoftEmailProvider(accessToken),
    mailbox: mailboxFromRow(mailboxRow),
    dailyLimit: null,
  };
}

export async function updateMailboxSignature(input: {
  organizationId: string;
  mailboxId: string;
  signatureText: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const text = input.signatureText.trim();
  const { error } = await admin
    .from("sending_mailboxes")
    .update({
      signature_text: text,
      signature_html: text ? textToHtml(text) : "",
      signature_source: text ? "MANUAL" : "NONE",
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", input.mailboxId)
    .eq("organization_id", input.organizationId)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
}

export async function setDefaultMailbox(input: {
  organizationId: string;
  mailboxId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: mailbox, error: mailboxError } = await admin
    .from("sending_mailboxes")
    .select("id,status")
    .eq("id", input.mailboxId)
    .eq("organization_id", input.organizationId)
    .single();
  if (mailboxError || mailbox.status !== "AVAILABLE")
    throw new AppError("MAILBOX_NOT_CONNECTED", "The selected mailbox is unavailable.", 409);
  const reset = await admin
    .from("sending_mailboxes")
    .update({ is_default: false })
    .eq("organization_id", input.organizationId);
  if (reset.error) throw new Error(reset.error.message);
  const selected = await admin
    .from("sending_mailboxes")
    .update({ is_default: true })
    .eq("id", input.mailboxId)
    .eq("organization_id", input.organizationId);
  if (selected.error) throw new Error(selected.error.message);
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("sending_settings")
    .eq("id", input.organizationId)
    .single();
  if (organizationError) throw new Error(organizationError.message);
  const settings = (organization.sending_settings ?? {}) as Record<string, unknown>;
  const update = await admin
    .from("organizations")
    .update({ sending_settings: { ...settings, defaultMailboxId: input.mailboxId } })
    .eq("id", input.organizationId);
  if (update.error) throw new Error(update.error.message);
}
