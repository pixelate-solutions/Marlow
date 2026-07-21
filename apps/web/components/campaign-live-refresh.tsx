"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const eventNames = ["workflow_transition", "agent_progress", "draft_ready", "run_status"];

export function CampaignLiveRefresh({
  campaignId,
  active,
}: {
  campaignId: string;
  active: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 150);
    };
    const source = new EventSource(`/api/campaigns/${encodeURIComponent(campaignId)}/events`);
    eventNames.forEach((name) => source.addEventListener(name, refresh));
    const poller = window.setInterval(() => router.refresh(), 5_000);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.clearInterval(poller);
      eventNames.forEach((name) => source.removeEventListener(name, refresh));
      source.close();
    };
  }, [active, campaignId, router]);

  return null;
}
