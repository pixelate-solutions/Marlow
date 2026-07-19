import type { LucideIcon } from "lucide-react";
import { Card } from "@marlow/ui";

export function MetricCard({
  label,
  value,
  trend,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  trend?: string;
  icon: LucideIcon;
  tone?: "teal" | "blue" | "amber" | "violet";
}) {
  return (
    <Card className="metric-card">
      <div className="metric-card__top">
        <span
          className={`metric-card__icon${tone === "teal" ? "" : ` metric-card__icon--${tone}`}`}
        >
          <Icon size={17} />
        </span>
        {trend ? <span className="metric-card__trend">{trend}</span> : null}
      </div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__label">{label}</div>
    </Card>
  );
}
