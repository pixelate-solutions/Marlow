"use client";

import { CheckCircle2, CircleDashed, Send, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

type Message = {
  role: "assistant" | "user";
  content: string;
  kind?: "error";
  retryContent?: string;
};

export function CampaignChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Tell me about your company, what you sell, and who you’re trying to reach.",
    },
  ]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(18);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = value.trim();
    if (!content || loading) return;
    const lastMessage = messages[messages.length - 1];
    const retryingFailedTurn =
      lastMessage?.kind === "error" && lastMessage.retryContent === content;
    const next = retryingFailedTurn
      ? messages.slice(0, -1)
      : [...messages, { role: "user", content } satisfies Message];
    setMessages(next);
    setValue("");
    setLoading(true);
    try {
      const response = campaignId
        ? await fetch(`/api/campaigns/${campaignId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          })
        : await fetch("/api/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "New outbound campaign",
              objective: content.slice(0, 500),
              initialMessage: content,
            }),
          });
      const payload = (await response.json()) as {
        data?: { id?: string; assistantMessage: string; readinessScore: number };
        error?: { message: string };
      };
      if (!response.ok || !payload.data) {
        setValue(content);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            kind: "error",
            retryContent: content,
            content:
              payload.error?.message ??
              "I couldn’t process that answer. Your answer is ready to retry.",
          },
        ]);
        return;
      }
      const data = payload.data;
      if (data.id) setCampaignId(data.id);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.assistantMessage,
        },
      ]);
      setProgress(data.readinessScore);
    } catch {
      setValue(content);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          kind: "error",
          retryContent: content,
          content:
            "The discovery service is temporarily unavailable. Your answer is ready to retry.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="new-campaign">
      <section className="card chat-card">
        <header className="chat-card__header">
          <span className="agent-orb">
            <Sparkles size={16} />
          </span>
          <div>
            <strong>Campaign discovery</strong>
            <span>
              {loading
                ? "Thinking about the next useful question…"
                : "Marlow asks one question at a time"}
            </span>
          </div>
        </header>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div className={`message message--${message.role}`} key={`${message.role}-${index}`}>
              <span className={`avatar avatar--${message.role === "user" ? "blue" : "teal"}`}>
                {message.role === "user" ? "AM" : "M"}
              </span>
              <div>
                <div className="message__bubble">{message.content}</div>
                <time>{index === 0 ? "Now" : "Just now"}</time>
              </div>
            </div>
          ))}
        </div>
        <form className="chat-compose" onSubmit={submit}>
          <div className="chat-compose__box">
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label="Answer Marlow"
              placeholder="Describe your offer and ideal customer…"
              rows={2}
            />
            <button type="submit" aria-label="Send answer" disabled={loading || !value.trim()}>
              <Send size={16} />
            </button>
          </div>
        </form>
      </section>
      <aside className="card profile-panel">
        <h2>Campaign profile</h2>
        <p>Built from your answers and public website research.</p>
        <div className="readiness-ring">
          <span
            className="ring"
            style={{
              background: `conic-gradient(var(--accent) 0 ${progress}%, #dfe7e3 ${progress}%)`,
            }}
          />
          <div>
            <strong>{progress}% ready</strong>
            <span>More detail needed before search</span>
          </div>
        </div>
        <div className="profile-checks">
          <div className="profile-check">
            <CheckCircle2 />
            <strong>Company and offer</strong>
            <span>Captured</span>
          </div>
          <div className="profile-check">
            <CheckCircle2 />
            <strong>Target market</strong>
            <span>Captured</span>
          </div>
          <div className="profile-check profile-check--missing">
            <CircleDashed />
            <strong>Target personas</strong>
            <span>Missing</span>
          </div>
          <div className="profile-check profile-check--missing">
            <CircleDashed />
            <strong>Proof and CTA</strong>
            <span>Missing</span>
          </div>
          <div className="profile-check profile-check--missing">
            <CircleDashed />
            <strong>Sending guardrails</strong>
            <span>Missing</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
