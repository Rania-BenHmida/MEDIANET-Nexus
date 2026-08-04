import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

type Trend = "up" | "down" | "flat";
type Tone = "default" | "success" | "warning" | "destructive";

export function KpiCard({
  label,
  value,
  delta,
  trend = "flat",
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: Trend;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-muted-foreground";

  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        {Icon && (
          <div className="size-7 rounded-md bg-muted grid place-items-center">
            <Icon className="size-3.5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight font-mono text-center">{value}</span>
        {delta && TrendIcon && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${toneClass}`}>
            <TrendIcon className="size-3" />
            {delta}
          </span>
        )}
        {delta && !TrendIcon && (
          <span className={`text-xs font-medium ${toneClass}`}>{delta}</span>
        )}
      </div>
    </div>
  );
}
