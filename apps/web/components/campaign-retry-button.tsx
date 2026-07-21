"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignRetryButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  async function retryCampaign() {
    if (retrying) return;
    setRetrying(true);
    setError("");

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/start`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Campaign could not be retried.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Campaign could not be retried.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <span className="campaign-retry">
      <button
        className="button button--secondary button--md"
        type="button"
        disabled={retrying}
        onClick={() => void retryCampaign()}
      >
        <RefreshCw className={retrying ? "spin" : undefined} size={15} />
        {retrying ? "Retrying..." : "Retry campaign"}
      </button>
      {error ? (
        <span className="campaign-retry__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
