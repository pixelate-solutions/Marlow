import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignBrowser, type CampaignBrowserItem } from "./campaign-browser";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const campaign: CampaignBrowserItem = {
  id: "campaign-1",
  name: "Operations campaign",
  objective: "Reach operations leaders",
  status: "DISCOVERING",
  progress: 10,
  prospects: 0,
  qualified: 0,
  drafts: 0,
  sent: 0,
  updated: "7/19/2026",
  color: "teal",
  followUpNeeded: 0,
  followUpDraftId: null,
};

describe("campaign browser", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.restoreAllMocks();
    router.push.mockReset();
    router.refresh.mockReset();
  });

  it("confirms and deletes a campaign from the list", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { id: campaign.id } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<CampaignBrowser campaigns={[campaign]} />);
    fireEvent.click(screen.getByRole("button", { name: `Delete ${campaign.name}` }));

    expect(confirm).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/campaigns/${campaign.id}`, {
        method: "DELETE",
      }),
    );
    expect(await screen.findByText("No matching campaigns")).toBeVisible();
  });

  it("keeps the campaign when deletion is cancelled", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<CampaignBrowser campaigns={[campaign]} />);
    fireEvent.click(screen.getByRole("button", { name: `Delete ${campaign.name}` }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(campaign.name)).toBeVisible();
  });
});
