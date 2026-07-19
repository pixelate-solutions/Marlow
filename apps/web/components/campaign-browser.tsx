"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, Progress } from "@marlow/ui";

export type CampaignBrowserItem = {
  id: string;
  name: string;
  objective: string;
  status: string;
  progress: number;
  prospects: number;
  qualified: number;
  drafts: number;
  sent: number;
  updated: string;
  color: "teal" | "blue" | "amber";
  followUpNeeded: number;
  followUpDraftId: string | null;
};

const filters = ["All", "Active", "Paused", "Complete"] as const;
type Filter = (typeof filters)[number];

function matchesFilter(status: string, filter: Filter): boolean {
  if (filter === "All") return true;
  if (filter === "Paused") return status === "PAUSED";
  if (filter === "Complete") return ["COMPLETED", "SENT"].includes(status);
  return !["DRAFT", "PAUSED", "FAILED", "COMPLETED", "SENT"].includes(status);
}

export function CampaignBrowser({ campaigns }: { campaigns: CampaignBrowserItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const visible = campaigns.filter(
    (campaign) =>
      matchesFilter(campaign.status, filter) &&
      `${campaign.name} ${campaign.objective}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <div className="campaigns-toolbar">
        <div className="search-box">
          <Search />
          <input
            className="input"
            aria-label="Search campaigns"
            placeholder="Search campaigns"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="filter-tabs" role="tablist" aria-label="Campaign status">
          {filters.map((item) => (
            <button
              className={`filter-tab${filter === item ? " filter-tab--active" : ""}`}
              key={item}
              type="button"
              role="tab"
              aria-selected={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {visible.length > 0 ? (
        <div className="campaign-grid">
          {visible.map((campaign) => (
            <Card
              className={`campaign-card campaign-card--${campaign.color}${campaign.followUpNeeded > 0 ? " campaign-card--follow-up" : ""}`}
              key={campaign.id}
            >
              <div className="campaign-card__top">
                <div>
                  <Link href={`/campaigns/${campaign.id}`}>
                    <h2>{campaign.name}</h2>
                  </Link>
                  <p className="campaign-card__objective">{campaign.objective}</p>
                </div>
                <Link
                  className="campaign-card__action"
                  href={
                    campaign.followUpDraftId
                      ? `/review/${campaign.followUpDraftId}`
                      : `/campaigns/${campaign.id}`
                  }
                >
                  {campaign.followUpDraftId
                    ? "Review follow-up"
                    : campaign.status === "DISCOVERING"
                      ? "Continue"
                      : campaign.status === "READY"
                        ? "Start"
                        : "Open"}
                </Link>
              </div>
              {campaign.followUpNeeded > 0 ? (
                <div className="campaign-card__follow-up">
                  <Badge tone="warning">Follow-up needed</Badge>
                  <span>
                    {campaign.followUpNeeded} {campaign.followUpNeeded === 1 ? "draft" : "drafts"}{" "}
                    ready for approval
                  </span>
                </div>
              ) : null}
              <Badge
                tone={
                  campaign.status === "PAUSED"
                    ? "warning"
                    : ["RESEARCHING", "SEARCHING_ACCOUNTS", "SEARCHING_PEOPLE"].includes(
                          campaign.status,
                        )
                      ? "info"
                      : "success"
                }
              >
                {campaign.status.replaceAll("_", " ")}
              </Badge>
              <div className="campaign-card__stats">
                <div className="campaign-card__stat">
                  <strong>{campaign.prospects}</strong>
                  <span>Found</span>
                </div>
                <div className="campaign-card__stat">
                  <strong>{campaign.qualified}</strong>
                  <span>Qualified</span>
                </div>
                <div className="campaign-card__stat">
                  <strong>{campaign.drafts}</strong>
                  <span>Drafts</span>
                </div>
                <div className="campaign-card__stat">
                  <strong>{campaign.sent}</strong>
                  <span>Sent</span>
                </div>
              </div>
              <Progress value={campaign.progress} />
              <div className="campaign-card__footer">
                <span>{campaign.progress}% complete</span>
                <span>Updated {campaign.updated}</span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="empty-state">
          <div>
            <h2>No matching campaigns</h2>
            <p>Adjust the search or status filter to see more campaigns.</p>
          </div>
        </Card>
      )}
    </>
  );
}
