"use client";

import { CheckCircle2, CircleDashed, Play, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";

export type CampaignChatMessage = {
  role: "assistant" | "user";
  content: string;
  kind?: "error";
  retryContent?: string;
};

const openingMessage: CampaignChatMessage = {
  role: "assistant",
  content: "Tell me about your company, what you sell, and who you’re trying to reach.",
};

export function CampaignChat({
  initialCampaignId = null,
  initialMessages,
  initialProgress = 18,
  initialReady = false,
}: {
  initialCampaignId?: string | null;
  initialMessages?: CampaignChatMessage[];
  initialProgress?: number;
  initialReady?: boolean;
}) {
  const router = useRouter();
  const startingMessages = initialMessages?.length ? initialMessages : [openingMessage];
  const unansweredMessage =
    initialCampaignId && startingMessages[startingMessages.length - 1]?.role === "user"
      ? (startingMessages[startingMessages.length - 1]?.content ?? null)
      : null;
  const [messages, setMessages] = useState<CampaignChatMessage[]>(startingMessages);
  const [value, setValue] = useState(unansweredMessage ?? "");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(initialProgress);
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(unansweredMessage);
  const [ready, setReady] = useState(initialReady);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = value.trim();
    if (!content || loading) return;
    const lastMessage = messages[messages.length - 1];
    const retryingFailedTurn =
      lastMessage?.kind === "error" && lastMessage.retryContent === content;
    const retryingSavedTurn =
      Boolean(campaignId) && lastMessage?.role === "user" && lastMessage.content === content;
    const next = retryingFailedTurn
      ? messages.slice(0, -1)
      : retryingSavedTurn
        ? messages
        : [...messages, { role: "user", content } satisfies CampaignChatMessage];
    setMessages(next);
    setValue("");
    setPendingAnswer(content);
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
        data?: { id?: string; assistantMessage: string; readinessScore: number; ready?: boolean };
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
      setPendingAnswer(null);
      setReady(Boolean(data.ready));
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

  async function startCampaign() {
    if (!campaignId || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/start`, { method: "POST" });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Campaign could not be started.");
      router.push(`/campaigns/${campaignId}`);
      router.refresh();
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Campaign could not be started.");
    } finally {
      setStarting(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
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
        {ready ? (
          <div className="campaign-ready-actions">
            <div>
              <strong>Campaign profile complete</strong>
              <span>
                Start prospecting when you are ready for Marlow to build the review queue.
              </span>
              {startError ? (
                <span className="campaign-ready-actions__error">{startError}</span>
              ) : null}
            </div>
            <button
              className="button button--primary button--md"
              type="button"
              disabled={starting}
              onClick={startCampaign}
            >
              <Play size={14} />
              {starting ? "Starting campaign…" : "Start prospecting"}
            </button>
          </div>
        ) : (
          <form className="chat-compose" onSubmit={submit}>
            {pendingAnswer && !loading ? (
              <p className="chat-compose__notice">
                Your last answer was saved. Select send to let Marlow continue.
              </p>
            ) : null}
            <div className="chat-compose__box">
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                aria-label="Answer Marlow"
                placeholder="Describe your offer and ideal customer…"
                rows={2}
              />
              <button type="submit" aria-label="Send answer" disabled={loading || !value.trim()}>
                <Send size={16} />
              </button>
            </div>
          </form>
        )}
      </section>
      <aside className="card profile-panel">
        <h2>Campaign profile</h2>
        <p>Built from your answers and public website research.</p>
        <div className="readiness-ring">
          <div
            className="ring"
            role="progressbar"
            aria-label="Campaign readiness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            style={{
              background: `conic-gradient(var(--accent) 0 ${progress}%, #dfe7e3 ${progress}%)`,
            }}
          >
            <span className="ring__value" aria-hidden="true">
              {progress}%
            </span>
          </div>
          <div className="readiness-copy">
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
