"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignRetryButton({
  campaignId,
  apolloCreditBudget = 100,
}: {
  campaignId: string;
  apolloCreditBudget?: number;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [creditBudget, setCreditBudget] = useState(
    apolloCreditBudget > 0 ? String(apolloCreditBudget) : "25",
  );
  const needsCreditBudget = apolloCreditBudget <= 0;

  async function retryCampaign() {
    if (retrying) return;
    setRetrying(true);
    setError("");

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(needsCreditBudget ? { apolloCreditBudget: Number(creditBudget) } : {}),
        }),
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
      {needsCreditBudget ? (
        <label className="campaign-retry__budget">
          <span>Apollo lead credit budget</span>
          <input
            aria-label="Apollo lead credit budget"
            min="1"
            max="100000"
            step="1"
            type="number"
            value={creditBudget}
            onChange={(event) => setCreditBudget(event.target.value)}
          />
        </label>
      ) : null}
      <button
        className="button button--secondary button--md"
        type="button"
        disabled={retrying}
        onClick={() => void retryCampaign()}
      >
        <RefreshCw className={retrying ? "spin" : undefined} size={15} />
        {retrying ? "Retrying..." : needsCreditBudget ? "Set budget and retry" : "Retry campaign"}
      </button>
      {error ? (
        <span className="campaign-retry__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
