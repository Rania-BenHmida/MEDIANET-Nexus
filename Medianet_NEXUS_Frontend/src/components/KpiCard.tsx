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
  accent,
  compact = false,
  labelSize,
  valueSize,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: Trend;
  tone?: Tone;
  icon?: LucideIcon;
  /**
   * Optional hex color (e.g. "#2E5FD9") — tints the icon chip and adds a
   * colored top accent bar. Omit for the default neutral card look.
   */
  accent?: string;
  /**
   * Centered label/value layout with a floating icon chip, for grids with
   * 5+ cards in a row. Defaults to false — the original left-aligned layout.
   */
  compact?: boolean;
  /** Tailwind text-size class for the label, e.g. "text-xs". Overrides the compact/default. */
  labelSize?: string;
  /** Tailwind text-size class for the value, e.g. "text-2xl". Overrides the compact/default. */
  valueSize?: string;
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

  const resolvedLabelSize = labelSize ?? (compact ? "text-[11px]" : "text-xs");
  const resolvedValueSize = valueSize ?? (compact ? "text-lg" : "text-2xl");

  if (compact) {
    return (
      <div
        className="relative bg-card rounded-xl border border-border shadow-[var(--shadow-card)] p-4 pt-5 space-y-1.5 border-t-4 flex flex-col items-center text-center"
        style={{ borderTopColor: accent }}
      >
        {Icon && (
          <div
            className="absolute top-3 right-3 size-6 rounded-md grid place-items-center"
            style={{ backgroundColor: accent ? `${accent}1a` : undefined }}
          >
            <Icon className="size-3.5" style={{ color: accent }} />
          </div>
        )}
        <p className={`${resolvedLabelSize} font-medium text-muted-foreground uppercase tracking-wider`}>{label}</p>
        <span className={`${resolvedValueSize} font-semibold tracking-tight font-mono`}>{value}</span>
        {/* Always takes up a line of height, even with no delta, so cards
            with and without one stay the same size instead of the delta
            line pushing this card taller than its neighbors. */}
        <span className={`h-0 text-xs font-medium flex items-center justify-center gap-0.5 ${delta ? toneClass : "invisible"}`}>
          {TrendIcon && <TrendIcon className="size-3" />}
          {delta ?? "·"}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`bg-card rounded-xl border border-border shadow-[var(--shadow-card)] p-5 space-y-3 ${accent ? "border-t-4" : ""}`}
      style={accent ? { borderTopColor: accent } : undefined}
    >
      <div className="flex items-center justify-between">
        <p className={`${resolvedLabelSize} font-medium text-muted-foreground uppercase tracking-wider`}>{label}</p>
        {Icon && (
          <div
            className={accent ? "size-7 rounded-md grid place-items-center" : "size-7 rounded-md bg-muted grid place-items-center"}
            style={accent ? { backgroundColor: `${accent}1a` } : undefined}
          >
            <Icon className={accent ? "size-3.5" : "size-3.5 text-muted-foreground"} style={accent ? { color: accent } : undefined} />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`${resolvedValueSize} font-semibold tracking-tight font-mono text-center`}>{value}</span>
        {delta && TrendIcon && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${toneClass}`}>
            <TrendIcon className="size-3" />
            {delta}
          </span>
        )}
        {delta && !TrendIcon && (
          <span className={`text-9 font-medium ${toneClass}`}>{delta}</span>
        )}
      </div>
    </div>
  );
}