import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewQueueEmptyState } from "./review-queue-empty-state";

describe("empty review queue", () => {
  it("routes an unfinished campaign back to discovery", () => {
    render(
      <ReviewQueueEmptyState
        campaigns={[{ id: "campaign-1", name: "New outbound campaign", status: "DISCOVERING" }]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Finish campaign discovery first" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue discovery" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1",
    );
  });

  it("offers to start a campaign whose profile is ready", () => {
    render(
      <ReviewQueueEmptyState
        campaigns={[{ id: "campaign-2", name: "Operations campaign", status: "READY" }]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your campaign is ready to start" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Start prospecting" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-2",
    );
  });

  it("explains what the queue contains when no campaigns are active", () => {
    render(<ReviewQueueEmptyState campaigns={[]} />);
    expect(screen.getByRole("heading", { name: "No drafts waiting for review" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Create a campaign" })).toHaveAttribute(
      "href",
      "/campaigns/new",
    );
  });
});
