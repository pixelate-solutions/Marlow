import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignRetryButton } from "./campaign-retry-button";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("campaign retry button", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.restoreAllMocks();
    router.refresh.mockReset();
  });

  it("queues the failed campaign and refreshes its progress", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "QUEUED" } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<CampaignRetryButton campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry campaign" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/campaigns/campaign-1/start", {
        method: "POST",
      }),
    );
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("shows the server error when the campaign cannot be retried", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Connect Gmail first." } }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<CampaignRetryButton campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry campaign" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connect Gmail first.");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
