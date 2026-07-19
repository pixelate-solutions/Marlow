"use client";

import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Link2,
  MessageSquareText,
  Save,
  Send,
  Sparkles,
  UserRoundX,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@marlow/ui";
import type { demoDrafts } from "@/lib/demo-data";

type Draft = (typeof demoDrafts)[number];

export function DraftReview({ draft, drafts }: { draft: Draft; drafts: Draft[] }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const words = useMemo(() => body.trim().split(/\s+/).filter(Boolean).length, [body]);
  const dirty = subject !== draft.subject || body !== draft.body;

  async function request(action: string, endpoint: string, options: RequestInit = {}) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch(endpoint, options);
      const payload = (await response.json()) as {
        data?: { status?: string; body?: string; subject?: string; message?: string };
        error?: { message: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Request failed.");
      if (payload.data?.subject) setSubject(payload.data.subject);
      if (payload.data?.body) setBody(payload.data.body);
      setNotice({
        kind: "success",
        text:
          payload.data?.message ??
          (action === "send"
            ? "Your connected mailbox confirmed the email was sent exactly once."
            : "Changes saved."),
      });
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Request failed.",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    request("save", `/api/drafts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
  const regenerate = (instruction: string) =>
    request(instruction, `/api/drafts/${draft.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    });
  const approve = async () => {
    if (dirty && !(await save())) return;
    await request("send", `/api/drafts/${draft.id}/approve-and-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ mailboxId: draft.mailboxId }),
    });
  };

  return (
    <>
      <div className="review-mobile-list" aria-label="Draft queue">
        {drafts.map((item) => (
          <Link href={`/review/${item.id}`} key={item.id}>
            {item.name} · {item.score}
          </Link>
        ))}
      </div>
      <div className="review-layout">
        <Card className="review-queue">
          <header className="review-queue__header">
            <h2>Ready for review</h2>
            <span>{drafts.length} grounded drafts waiting</span>
          </header>
          <div className="draft-list">
            {drafts.map((item) => (
              <Link
                className={`draft-list-item${item.id === draft.id ? " draft-list-item--active" : ""}`}
                href={`/review/${item.id}`}
                key={item.id}
              >
                <span className="avatar avatar--teal">{item.initials}</span>
                <div className="draft-list-item__body">
                  <div className="draft-list-item__top">
                    <strong>{item.name}</strong>
                    <span className="score">{item.score}</span>
                  </div>
                  <p>
                    {item.title} · {item.company}
                  </p>
                  <p className="draft-list-item__subject">{item.subject}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="review-main">
          <header className="review-top">
            <div className="review-top__prospect">
              <span className="avatar avatar--teal">{draft.initials}</span>
              <div>
                <strong>{draft.name}</strong>
                <span>
                  {draft.title} · {draft.company} · {draft.location}
                </span>
              </div>
              <Badge tone="success">{draft.emailStatus}</Badge>
              <span className="score">{draft.score}</span>
            </div>
            <div className="review-top__actions">
              <Button
                variant="secondary"
                size="sm"
                disabled={!dirty || busy !== null}
                onClick={save}
              >
                <Save size={13} />
                Save changes
              </Button>
              <Button size="sm" disabled={busy !== null} onClick={approve}>
                <Send size={13} />
                {busy === "send" ? "Sending…" : "Approve and send"}
              </Button>
            </div>
          </header>
          <div className="review-content">
            <section className="email-pane">
              {notice ? (
                <div
                  className={`status-banner${notice.kind === "error" ? " status-banner--error" : ""}`}
                  role="status"
                >
                  {notice.kind === "error" ? (
                    <AlertTriangle size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {notice.text}
                </div>
              ) : null}
              <div className="email-pane__toolbar">
                <button
                  className="ai-action"
                  onClick={() => regenerate("Regenerate using a different grounded phrasing.")}
                  disabled={busy !== null}
                >
                  <WandSparkles size={12} />
                  Regenerate
                </button>
                <button
                  className="ai-action"
                  onClick={() => regenerate("Shorten this while preserving the evidence and CTA.")}
                  disabled={busy !== null}
                >
                  Shorten
                </button>
                <button
                  className="ai-action"
                  onClick={() =>
                    regenerate("Choose a different defensible angle from the saved research.")
                  }
                  disabled={busy !== null}
                >
                  Change angle
                </button>
                <button
                  className="ai-action"
                  onClick={() => regenerate("Make this more direct without becoming pushy.")}
                  disabled={busy !== null}
                >
                  More direct
                </button>
                <button
                  className="ai-action"
                  onClick={() => regenerate("Make this more conversational and natural.")}
                  disabled={busy !== null}
                >
                  More conversational
                </button>
              </div>
              <div className="email-editor">
                <div className="email-field">
                  <label htmlFor="to">To</label>
                  <input id="to" value={draft.email} readOnly aria-readonly="true" />
                </div>
                <div className="email-field">
                  <label htmlFor="from">From</label>
                  <input id="from" value={draft.mailbox} readOnly aria-readonly="true" />
                </div>
                <div className="email-field">
                  <label htmlFor="subject">Subject</label>
                  <input
                    id="subject"
                    value={subject}
                    maxLength={120}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </div>
                <textarea
                  className="email-body"
                  aria-label="Email body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
                <div className="email-signature">{draft.signature}</div>
                <div className="email-footer-preview">{draft.complianceFooter}</div>
              </div>
              <div className="email-editor__bottom">
                <span>
                  {words} words · {body.length} characters
                </span>
                <span>
                  {dirty
                    ? "Unsaved edits invalidate prior approval"
                    : "Exact draft ready for approval"}
                </span>
              </div>
              <div className="email-pane__toolbar" style={{ marginTop: 20 }}>
                <button
                  className="ai-action"
                  onClick={() =>
                    request("skip", `/api/drafts/${draft.id}/skip`, { method: "POST" })
                  }
                >
                  <Ban size={12} />
                  Skip
                </button>
                <button
                  className="ai-action"
                  onClick={() =>
                    request("block-person", `/api/prospects/${draft.prospectId}/block`, {
                      method: "POST",
                    })
                  }
                >
                  <UserRoundX size={12} />
                  Block person
                </button>
                <button
                  className="ai-action"
                  onClick={() =>
                    request("block-company", `/api/companies/${draft.prospectId}/block`, {
                      method: "POST",
                    })
                  }
                >
                  <Building2 size={12} />
                  Block company
                </button>
                <button
                  className="ai-action"
                  onClick={() =>
                    request("report", `/api/drafts/${draft.id}/report-research`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        reason: "User reported inaccurate or weak research.",
                      }),
                    })
                  }
                >
                  <FileWarning size={12} />
                  Report bad research
                </button>
              </div>
            </section>
            <aside className="research-pane">
              <section className="research-section">
                <h3 className="research-section__title">
                  <Sparkles size={13} />
                  Why this prospect
                </h3>
                <p>{draft.selectionReason}</p>
              </section>
              <section className="research-section">
                <h3 className="research-section__title">
                  <Building2 size={13} />
                  Company summary
                </h3>
                <p>{draft.companySummary}</p>
              </section>
              <section className="research-section">
                <h3 className="research-section__title">
                  <MessageSquareText size={13} />
                  Chosen angle
                </h3>
                <p>{draft.angle}</p>
              </section>
              <section className="research-section">
                <h3 className="research-section__title">
                  <Sparkles size={13} />
                  Relevant signals
                </h3>
                <div className="signal-list">
                  {draft.signals.map((signal) => (
                    <span className="signal" key={signal}>
                      {signal}
                    </span>
                  ))}
                </div>
              </section>
              <section className="research-section">
                <h3 className="research-section__title">
                  <Link2 size={13} />
                  Supporting sources
                </h3>
                <div className="source-list">
                  {draft.sources.map((source) => (
                    <a
                      className="source"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      key={source.id}
                    >
                      <ExternalLink />
                      <span>
                        <strong>{source.title}</strong>
                        <span>
                          {source.sourceType} · {source.date} · {source.confidence} confidence
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
              <section className="research-section">
                <div className="uncertainty">
                  <AlertTriangle size={14} />
                  {draft.uncertainty}
                </div>
              </section>
            </aside>
          </div>
        </Card>
      </div>
    </>
  );
}
