"use client";

import { CheckCircle2, Link2, LoaderCircle, RefreshCw, Save, Star, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "@marlow/ui";
import type { SendingMailbox } from "@/lib/mailboxes";

type Provider = "google" | "microsoft";

function MailboxEditor({ mailbox, provider }: { mailbox: SendingMailbox; provider: Provider }) {
  const router = useRouter();
  const [signature, setSignature] = useState(mailbox.signatureText);
  const [busy, setBusy] = useState<"signature" | "default" | null>(null);
  const [notice, setNotice] = useState("");

  async function update(
    payload: { signatureText?: string; isDefault?: true },
    action: typeof busy,
  ) {
    setBusy(action);
    setNotice("");
    const response = await fetch(`/api/integrations/email/mailboxes/${mailbox.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    setNotice(
      response.ok
        ? payload.isDefault
          ? "Default sending mailbox updated."
          : "Mailbox signature saved."
        : (result.error?.message ?? "Mailbox could not be updated."),
    );
    setBusy(null);
    if (response.ok) router.refresh();
  }

  return (
    <div className="mailbox-item">
      <div className="mailbox-item__header">
        <div>
          <strong>{mailbox.email}</strong>
          <span>{mailbox.displayName}</span>
        </div>
        <div className="mailbox-item__badges">
          {mailbox.isDefault ? <Badge tone="success">Default sender</Badge> : null}
          <Badge tone={mailbox.status === "AVAILABLE" ? "info" : "warning"}>
            {mailbox.status === "AVAILABLE" ? "Available" : "Reconnect required"}
          </Badge>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`signature-${mailbox.id}`}>Email signature</label>
        <textarea
          className="textarea mailbox-signature"
          id={`signature-${mailbox.id}`}
          value={signature}
          onChange={(event) => setSignature(event.target.value)}
          placeholder="Name, title, company, phone, and any other signature details"
          rows={5}
        />
        <span className="field__hint">
          {provider === "google" && mailbox.signatureSource === "PROVIDER"
            ? "Imported from this Gmail send-as address. Saved edits become a Marlow override."
            : provider === "microsoft"
              ? "Microsoft Graph does not expose Outlook signatures. Paste it here once and Marlow will preserve the text and line breaks."
              : "This saved signature is appended to every approved email from this address."}
        </span>
      </div>
      {notice ? (
        <div className="status-banner" role="status">
          {notice}
        </div>
      ) : null}
      <div className="mailbox-item__actions">
        <Button
          variant="secondary"
          onClick={() => update({ signatureText: signature }, "signature")}
          disabled={busy !== null}
        >
          {busy === "signature" ? <LoaderCircle size={14} /> : <Save size={14} />}
          Save signature
        </Button>
        {!mailbox.isDefault ? (
          <Button
            variant="secondary"
            onClick={() => update({ isDefault: true }, "default")}
            disabled={busy !== null || mailbox.status !== "AVAILABLE"}
          >
            {busy === "default" ? <LoaderCircle size={14} /> : <Star size={14} />}
            Make default
          </Button>
        ) : (
          <span className="mailbox-default-note">
            <CheckCircle2 size={14} /> Used for new campaigns
          </span>
        )}
      </div>
    </div>
  );
}

export function EmailConnection({
  provider,
  configured,
  status,
  mailboxes,
}: {
  provider: Provider;
  configured: boolean;
  status: string;
  mailboxes: SendingMailbox[];
}) {
  const router = useRouter();
  const connected = status === "CONNECTED";
  const [busy, setBusy] = useState<"connect" | "disconnect" | "sync" | null>(null);
  const [notice, setNotice] = useState("");
  const label = provider === "google" ? "Google" : "Microsoft";

  async function connect() {
    setBusy("connect");
    setNotice("");
    const response = await fetch(`/api/integrations/email/${provider}/connect`, {
      method: "POST",
    });
    const payload = (await response.json()) as {
      data?: { authorizationUrl?: string; demo?: boolean };
      error?: { message?: string };
    };
    if (!response.ok) {
      setBusy(null);
      setNotice(payload.error?.message ?? `${label} could not be connected.`);
      return;
    }
    if (payload.data?.authorizationUrl) window.location.assign(payload.data.authorizationUrl);
    else {
      setBusy(null);
      setNotice(`Demo ${label} mailbox connected.`);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setNotice("");
    const response = await fetch(`/api/integrations/email/${provider}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: { message?: string } };
    setBusy(null);
    setNotice(
      response.ok
        ? `${label} mailbox access removed from Marlow.`
        : (payload.error?.message ?? `${label} could not be disconnected.`),
    );
    if (response.ok) router.refresh();
  }

  async function sync() {
    setBusy("sync");
    setNotice("");
    const response = await fetch(`/api/integrations/email/${provider}/sync`, { method: "POST" });
    const payload = (await response.json()) as { error?: { message?: string } };
    setBusy(null);
    setNotice(
      response.ok
        ? `${label} mailbox details refreshed.`
        : (payload.error?.message ?? `${label} mailbox details could not be refreshed.`),
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="email-connection">
      {notice ? (
        <div className="status-banner" role="status">
          {notice}
        </div>
      ) : null}
      {!configured ? (
        <div className="status-banner status-banner--warning" role="status">
          Add the {label} OAuth client ID, secret, and production callback URL to Vercel before
          connecting.
        </div>
      ) : null}
      {connected ? (
        <>
          <div className="mailbox-list">
            {mailboxes.length ? (
              mailboxes.map((mailbox) => (
                <MailboxEditor key={mailbox.id} mailbox={mailbox} provider={provider} />
              ))
            ) : (
              <p className="mailbox-empty">No available sending address was returned.</p>
            )}
          </div>
          <div className="integration-actions">
            <Button variant="secondary" onClick={sync} disabled={busy !== null}>
              {busy === "sync" ? <LoaderCircle size={14} /> : <RefreshCw size={14} />}
              Refresh mailbox
            </Button>
            <Button variant="secondary" onClick={disconnect} disabled={busy !== null}>
              {busy === "disconnect" ? <LoaderCircle size={14} /> : <Unplug size={14} />}
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <Button onClick={connect} disabled={!configured || busy !== null}>
          {busy === "connect" ? <LoaderCircle size={14} /> : <Link2 size={14} />}
          {busy === "connect" ? "Connecting…" : `Connect ${label}`}
        </Button>
      )}
    </div>
  );
}
