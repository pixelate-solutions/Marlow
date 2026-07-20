"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  Database,
  LoaderCircle,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { DiscoveryActivity } from "@/lib/discovery-activity";
import { ChatMarkdown } from "./chat-markdown";

export type CampaignChatMessage = {
  role: "assistant" | "user";
  content: string;
  kind?: "error" | "streaming";
  retryContent?: string;
  activity?: DiscoveryActivity[];
};

type DiscoveryResponseData = {
  id?: string;
  assistantMessage: string;
  readinessScore: number;
  ready?: boolean;
  missingRequiredFields?: string[];
  unresolvedQuestions?: string[];
  activity?: DiscoveryActivity[];
};

type DiscoveryResponse = {
  data?: DiscoveryResponseData;
  error?: { message: string };
};

const streamIntervalMs = 24;

function responseChunks(content: string): string[] {
  return content.match(/\S+\s*/g) ?? [content];
}

function upsertActivity(
  activities: DiscoveryActivity[],
  activity: DiscoveryActivity,
): DiscoveryActivity[] {
  const index = activities.findIndex((item) => item.id === activity.id);
  if (index === -1) return [...activities, activity];
  const next = [...activities];
  next[index] = activity;
  return next;
}

function activityDuration(durationMs?: number): string | null {
  if (durationMs === undefined) return null;
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function ActivityTrace({
  activities,
  live = false,
}: {
  activities: DiscoveryActivity[];
  live?: boolean;
}) {
  return (
    <div className="discovery-activity" aria-label="Marlow activity">
      <div className="discovery-activity__header">
        <span>Activity</span>
        <span>{live ? "Live" : "Completed"}</span>
      </div>
      <p>Tool activity and concise reasoning summaries. Private reasoning is not shown.</p>
      <ol>
        {activities.map((activity) => {
          const Icon =
            activity.status === "warning"
              ? AlertTriangle
              : activity.status === "running"
                ? LoaderCircle
                : activity.kind === "tool"
                  ? Database
                  : activity.kind === "validation"
                    ? ShieldCheck
                    : activity.kind === "model"
                      ? Sparkles
                      : Check;
          const duration = activityDuration(activity.durationMs);
          return (
            <li
              className={`discovery-activity__item discovery-activity__item--${activity.status}`}
              key={activity.id}
            >
              <span className="discovery-activity__icon">
                <Icon size={13} aria-hidden="true" />
              </span>
              <span className="discovery-activity__copy">
                <strong>{activity.label}</strong>
                <span>{activity.detail}</span>
              </span>
              {duration ? <time>{duration}</time> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

async function readActivityStream(
  response: Response,
  onActivity: (activity: DiscoveryActivity) => void,
): Promise<{ payload: DiscoveryResponse; activity: DiscoveryActivity[] }> {
  if (!response.body) throw new Error("The activity stream did not include a response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let payload: DiscoveryResponse = {};
  let activity: DiscoveryActivity[] = [];

  const consume = (block: string) => {
    const lines = block.split("\n");
    const event = lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!event || !data) return;
    const value = JSON.parse(data) as DiscoveryActivity | DiscoveryResponse;
    if (event === "activity") {
      const nextActivity = value as DiscoveryActivity;
      activity = upsertActivity(activity, nextActivity);
      onActivity(nextActivity);
    } else if (event === "result" || event === "error") {
      payload = value as DiscoveryResponse;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return { payload, activity };
}

const openingMessage: CampaignChatMessage = {
  role: "assistant",
  content: "Tell me about your company, what you sell, and who you’re trying to reach.",
};

export function CampaignChat({
  initialCampaignId = null,
  initialMessages,
  initialProgress = 18,
  initialReady = false,
  initialMissingRequiredFields = [],
}: {
  initialCampaignId?: string | null;
  initialMessages?: CampaignChatMessage[];
  initialProgress?: number;
  initialReady?: boolean;
  initialMissingRequiredFields?: string[];
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
  const [tracing, setTracing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [activeActivity, setActiveActivity] = useState<DiscoveryActivity[]>([]);
  const [progress, setProgress] = useState(initialProgress);
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(unansweredMessage);
  const [ready, setReady] = useState(initialReady);
  const [missingRequiredFields, setMissingRequiredFields] = useState(initialMissingRequiredFields);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<DiscoveryActivity[]>([]);
  const busy = loading || tracing || streaming;

  useEffect(() => {
    messageEndRef.current?.scrollIntoView?.({ behavior: streaming ? "auto" : "smooth" });
  }, [activeActivity, loading, messages, streaming]);

  async function replayActivityTrace(activity: DiscoveryActivity[]) {
    if (!activity.length) return;
    setLoading(false);
    setTracing(true);
    setActiveActivity([]);
    activityRef.current = [];
    for (const item of activity) {
      activityRef.current = upsertActivity(activityRef.current, item);
      setActiveActivity(activityRef.current);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    setTracing(false);
  }

  async function revealAssistantMessage(content: string, activity: DiscoveryActivity[] = []) {
    setLoading(false);
    setTracing(false);
    setActiveActivity([]);
    activityRef.current = [];
    const chunks = responseChunks(content);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || chunks.length <= 1) {
      setMessages((current) => [...current, { role: "assistant", content, activity }]);
      return;
    }

    setStreaming(true);
    setMessages((current) => [
      ...current,
      { role: "assistant", content: "", kind: "streaming", activity },
    ]);
    let revealed = "";
    for (const chunk of chunks) {
      await new Promise((resolve) => window.setTimeout(resolve, streamIntervalMs));
      revealed += chunk;
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.kind === "streaming") {
          next[next.length - 1] = { ...last, content: revealed, activity };
        }
        return next;
      });
    }
    setMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];
      if (last?.role === "assistant" && last.kind === "streaming") {
        next[next.length - 1] = { role: "assistant", content, activity };
      }
      return next;
    });
    setStreaming(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendAnswer(value.trim());
  }

  async function sendAnswer(content: string) {
    if (!content || busy) return;
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
    setTracing(false);
    setActiveActivity([]);
    activityRef.current = [];
    try {
      const response = campaignId
        ? await fetch(`/api/campaigns/${campaignId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
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
      const streamed = response.headers.get("content-type")?.includes("text/event-stream");
      const streamResult = streamed
        ? await readActivityStream(response, (activity) => {
            activityRef.current = upsertActivity(activityRef.current, activity);
            setActiveActivity(activityRef.current);
          })
        : null;
      const payload = streamResult
        ? streamResult.payload
        : ((await response.json()) as DiscoveryResponse);
      const activity = streamResult?.activity ?? payload.data?.activity ?? [];
      if (!response.ok || !payload.data) {
        setValue(content);
        setLoading(false);
        setTracing(false);
        setActiveActivity([]);
        activityRef.current = [];
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            kind: "error",
            retryContent: content,
            activity,
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
      if (!streamed) await replayActivityTrace(activity);
      await revealAssistantMessage(data.assistantMessage, activity);
      setReady(Boolean(data.ready));
      setProgress(data.readinessScore);
      setMissingRequiredFields(data.missingRequiredFields ?? []);
    } catch {
      setValue(content);
      setTracing(false);
      const activity = activityRef.current;
      setActiveActivity([]);
      activityRef.current = [];
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          kind: "error",
          retryContent: content,
          activity,
          content:
            "The discovery service is temporarily unavailable. Your answer is ready to retry.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function recheckReadiness() {
    if (!campaignId || busy) return;
    await sendAnswer("I updated the sending settings. Please recheck campaign readiness.");
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

  const needsPostalAddress = missingRequiredFields.includes("sender.postalAddress");
  const needsMailbox = missingRequiredFields.includes("sender.sendingMailboxId");
  const profileSections = [
    {
      label: "Company and offer",
      prefixes: ["campaignObjective", "sender.company", "offer.summary", "offer.primaryValue"],
      defaultCaptured: true,
    },
    {
      label: "Target market",
      prefixes: ["targetAccount"],
      defaultCaptured: true,
    },
    {
      label: "Target personas",
      prefixes: ["targetPersonas"],
      defaultCaptured: false,
    },
    {
      label: "Proof and CTA",
      prefixes: ["offer.painsSolved", "offer.callToAction", "offer.approvedProof"],
      defaultCaptured: false,
    },
    {
      label: "Sending guardrails",
      prefixes: [
        "sender.name",
        "sender.signature",
        "sender.postalAddress",
        "sender.sendingMailboxId",
        "limits",
        "messaging.tone",
      ],
      defaultCaptured: false,
    },
  ];

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
                ? activeActivity.length
                  ? "Showing live model activity…"
                  : "Thinking about the next useful question…"
                : tracing
                  ? "Reviewing completed activity…"
                  : streaming
                    ? "Writing the response…"
                    : "Marlow asks one question at a time"}
            </span>
          </div>
        </header>
        <div className="chat-messages" aria-live="polite" aria-busy={busy}>
          {messages.map((message, index) => (
            <div className={`message message--${message.role}`} key={`${message.role}-${index}`}>
              <span className={`avatar avatar--${message.role === "user" ? "blue" : "teal"}`}>
                {message.role === "user" ? "AM" : "M"}
              </span>
              <div>
                {message.role === "assistant" && message.activity?.length ? (
                  <ActivityTrace activities={message.activity} />
                ) : null}
                <div
                  className={`message__bubble${message.kind === "streaming" ? " message__bubble--streaming" : ""}`}
                  data-testid={message.kind === "streaming" ? "streaming-response" : undefined}
                >
                  {message.role === "assistant" ? (
                    <ChatMarkdown content={message.content} />
                  ) : (
                    message.content
                  )}
                </div>
                <time>{index === 0 ? "Now" : "Just now"}</time>
              </div>
            </div>
          ))}
          {(loading || tracing) && activeActivity.length ? (
            <div className="message message--assistant message--activity" role="status">
              <span className="avatar avatar--teal">M</span>
              <div>
                <ActivityTrace activities={activeActivity} live />
                <time>Now</time>
              </div>
            </div>
          ) : loading ? (
            <div className="message message--assistant message--thinking" role="status">
              <span className="avatar avatar--teal">M</span>
              <div>
                <div className="message__bubble message__bubble--thinking">
                  <span>Thinking</span>
                  <span className="thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
                <time>Now</time>
              </div>
            </div>
          ) : null}
          <div ref={messageEndRef} />
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
        ) : needsPostalAddress || needsMailbox ? (
          <div className="campaign-readiness-blocker" role="status">
            <div>
              <strong>
                {needsPostalAddress
                  ? "Add a postal address to continue"
                  : "Connect a sending mailbox to continue"}
              </strong>
              <span>
                {needsPostalAddress
                  ? "Marlow needs a valid postal address for the compliance footer before prospecting can start."
                  : "Choose the mailbox that should send this campaign before prospecting can start."}
              </span>
            </div>
            <div className="campaign-readiness-blocker__actions">
              <Link
                className="button button--secondary button--sm"
                href={`/settings/sending?returnTo=${encodeURIComponent(
                  campaignId ? `/campaigns/${campaignId}` : "/campaigns",
                )}`}
              >
                Complete sending setup
              </Link>
              <button
                className="button button--primary button--sm"
                type="button"
                disabled={busy}
                onClick={recheckReadiness}
              >
                {busy ? "Checking…" : "Recheck readiness"}
              </button>
            </div>
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
                disabled={busy}
                aria-label="Answer Marlow"
                placeholder="Describe your offer and ideal customer…"
                rows={2}
              />
              <button type="submit" aria-label="Send answer" disabled={busy || !value.trim()}>
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
            <span>
              {ready
                ? "Ready to start prospecting"
                : missingRequiredFields.length
                  ? `${missingRequiredFields.length} requirement${missingRequiredFields.length === 1 ? "" : "s"} remaining`
                  : "More detail needed before search"}
            </span>
          </div>
        </div>
        <div className="profile-checks">
          {profileSections.map((section) => {
            const captured = ready
              ? true
              : missingRequiredFields.length
                ? !missingRequiredFields.some((field) =>
                    section.prefixes.some((prefix) => field.startsWith(prefix)),
                  )
                : section.defaultCaptured;
            return (
              <div
                className={`profile-check${captured ? "" : " profile-check--missing"}`}
                key={section.label}
              >
                {captured ? <CheckCircle2 /> : <CircleDashed />}
                <strong>{section.label}</strong>
                <span>{captured ? "Captured" : "Missing"}</span>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
