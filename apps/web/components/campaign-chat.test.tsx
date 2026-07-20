import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignChat } from "./campaign-chat";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("campaign discovery chat", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.restoreAllMocks();
    router.push.mockReset();
    router.refresh.mockReset();
  });

  it("resumes an unanswered saved turn without duplicating the user message", async () => {
    const savedAnswer = "Operations leaders feel the problem, and the COO approves the purchase.";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            assistantMessage: "Which company sizes and locations should I prioritize?",
            readinessScore: 54,
            ready: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <CampaignChat
        initialCampaignId="campaign-1"
        initialMessages={[
          { role: "assistant", content: "Who owns the buying decision?" },
          { role: "user", content: savedAnswer },
        ]}
        initialProgress={42}
      />,
    );

    expect(screen.getByLabelText("Answer Marlow")).toHaveValue(savedAnswer);
    expect(screen.getByText(/last answer was saved/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));

    expect(
      await screen.findByText("Which company sizes and locations should I prioritize?"),
    ).toBeVisible();
    expect(screen.getAllByText(savedAnswer)).toHaveLength(1);
    expect(screen.getByRole("progressbar", { name: "Campaign readiness" })).toHaveAttribute(
      "aria-valuenow",
      "54",
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/campaigns/campaign-1/messages",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("sends with Enter and keeps Shift+Enter available for a new line", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "campaign-3",
            assistantMessage: "Which regions should I prioritize?",
            readinessScore: 36,
            ready: false,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<CampaignChat />);
    const composer = screen.getByLabelText("Answer Marlow");
    fireEvent.change(composer, { target: { value: "Operations leaders\nat manufacturers" } });

    const shifted = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    composer.dispatchEvent(shifted);
    expect(shifted.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const entered = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    composer.dispatchEvent(entered);
    expect(entered.defaultPrevented).toBe(true);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/campaigns",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows thinking and progressively reveals the completed response", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const reply =
      "Thanks, that gives me a clear picture of the audience. Which locations should Marlow prioritize for this campaign?";

    render(
      <CampaignChat
        initialCampaignId="campaign-4"
        initialMessages={[{ role: "assistant", content: "Who should this campaign reach?" }]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Answer Marlow"), {
      target: { value: "Operations leaders at equipment companies" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));

    expect(screen.getByRole("status")).toHaveTextContent("Thinking");
    expect(screen.getByLabelText("Answer Marlow")).toBeDisabled();

    resolveFetch(
      new Response(
        JSON.stringify({
          data: { assistantMessage: reply, readinessScore: 54, ready: false },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const streamed = await screen.findByTestId("streaming-response");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(streamed).not.toHaveTextContent(reply);
    expect(await screen.findByText(reply, {}, { timeout: 2_000 })).toBeVisible();
    expect(screen.getByLabelText("Answer Marlow")).toBeEnabled();
  });

  it("formats assistant Markdown while keeping user messages as plain text", () => {
    render(
      <CampaignChat
        initialMessages={[
          {
            role: "assistant",
            content:
              "## Recommended audience\n\n- **Operations leaders**\n- IT directors\n\n[View source](https://example.com/research)",
          },
          { role: "user", content: "Keep **my text** literal" },
          { role: "assistant", content: "Use `verified facts` only." },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Recommended audience", level: 2 })).toBeVisible();
    expect(screen.getByText("Operations leaders").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "View source" })).toHaveAttribute(
      "href",
      "https://example.com/research",
    );
    expect(screen.getByRole("link", { name: "View source" })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Keep **my text** literal")).toBeVisible();
    expect(screen.getByText("verified facts").tagName).toBe("CODE");
  });

  it("starts prospecting after discovery is complete", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "QUEUED" } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <CampaignChat
        initialCampaignId="campaign-2"
        initialMessages={[{ role: "assistant", content: "Your campaign profile is complete." }]}
        initialProgress={100}
        initialReady
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start prospecting" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/campaigns/campaign-2"));
  });
});
