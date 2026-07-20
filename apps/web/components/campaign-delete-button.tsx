"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignDeleteButton({
  campaignId,
  campaignName,
  compact = false,
  onDeleted,
  onError,
}: {
  campaignId: string;
  campaignName: string;
  compact?: boolean;
  onDeleted?: (campaignId: string) => void;
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function removeCampaign() {
    const confirmed = window.confirm(
      `Delete "${campaignName}"? The campaign and its unsent work will be removed. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    onError?.("");
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Campaign could not be deleted.");
      }
      onDeleted?.(campaignId);
      if (!onDeleted) {
        router.push("/campaigns");
        router.refresh();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Campaign could not be deleted.";
      setError(message);
      onError?.(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <span className={`campaign-delete${compact ? " campaign-delete--compact" : ""}`}>
      <button
        className={
          compact ? "icon-button campaign-card__delete" : "button button--danger button--md"
        }
        type="button"
        aria-label={`Delete ${campaignName}`}
        title={compact ? `Delete ${campaignName}` : undefined}
        disabled={deleting}
        onClick={() => void removeCampaign()}
      >
        <Trash2 size={compact ? 14 : 15} />
        {compact ? null : deleting ? "Deleting…" : "Delete campaign"}
      </button>
      {!compact && error ? (
        <span className="campaign-delete__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
