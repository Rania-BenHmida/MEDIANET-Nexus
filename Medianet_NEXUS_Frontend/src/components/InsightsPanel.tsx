import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInsights, useRefreshInsight } from "@/hooks/use-insights";
import type { InsightCategory } from "@/lib/roles";
import type { InsightTone } from "@/lib/api/insights";
import {
  Sparkles, RefreshCw, Loader2, TrendingUp, Users, Building2, FolderKanban,
} from "lucide-react";

const CATEGORY_ICON: Record<InsightCategory, typeof TrendingUp> = {
  revenue_deals: TrendingUp,
  customer_churn_b2c: Users,
  customer_churn_b2b: Building2,
  projects: FolderKanban,
};

/**
 * Self-contained AI insights block — tab bar (even for a single category,
 * kept for visual consistency with the Executive Overview) + active-category
 * card + refresh control. Used on /dashboard (full multi-tab, all
 * accessible categories) and, filtered to a single relevant category, on
 * each module's own root page for the role that owns it (project_manager on
 * /projects, commercial on /deals, customer_success on /customers) so those
 * roles get their own slice of insights without needing /dashboard access.
 */
export function InsightsPanel({
  categories,
  cardLayout = "grid",
}: {
  categories: InsightCategory[];
  /** "grid" (default) lays insight cards side-by-side horizontally — used
   * on module root pages (Projects, Deals, Customers) to cut down scroll
   * height. "stacked" keeps the original vertical list — used on
   * /dashboard, which already has more room and a different rhythm. */
  cardLayout?: "grid" | "stacked";
}) {
  const { t, i18n } = useTranslation();
  const { data: insights, isLoading } = useInsights(categories);
  const refresh = useRefreshInsight(categories);

  const [active, setActive] = useState<InsightCategory | null>(categories[0] ?? null);
  const activeCategory = active && categories.includes(active) ? active : categories[0] ?? null;

  const activeData = insights?.find((i) => i.category === activeCategory);
  const isRefreshing = refresh.isPending && refresh.variables === activeCategory;

  if (categories.length === 0 || !activeCategory) return null;

  return (
    <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
      {/* ── tiny in-page navbar ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-1 overflow-x-auto">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICON[cat];
            const isActive = cat === activeCategory;
            return (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-3.5" />
                {t(`dashboard.insights.categories.${cat}.label`)}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => refresh.mutate(activeCategory)}
          disabled={isRefreshing}
          className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-60 transition-colors"
        >
          {isRefreshing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          {isRefreshing
            ? t("dashboard.insights.refreshing")
            : (activeData?.status ?? "empty") === "empty"
              ? t("dashboard.insights.generate")
              : t("dashboard.insights.refresh")}
        </button>
      </div>

      {/* ── active category panel ────────────────────────────────── */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="size-3.5 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground truncate">
              {t(`dashboard.insights.categories.${activeCategory}.description`)}
            </p>
          </div>
          {activeData?.status === "ready" && activeData.generatedAt && (
            <p className="text-[10px] font-mono text-muted-foreground shrink-0">
              {t("dashboard.insights.lastUpdated", {
                time: new Date(activeData.generatedAt).toLocaleString(i18n.language),
              })}
            </p>
          )}
        </div>

        {isLoading && !activeData && (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        )}

        {!isLoading && (activeData?.status ?? "empty") === "empty" && !isRefreshing && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("dashboard.insights.empty")}
          </p>
        )}

        {isRefreshing && (!activeData || activeData.status === "empty") && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("dashboard.insights.generating")}
          </p>
        )}

        {activeData?.status === "failed" && (
          <p className="text-xs text-destructive leading-relaxed">
            {t("dashboard.insights.failed")}
            {activeData.errorMessage ? ` — ${activeData.errorMessage}` : ""}
          </p>
        )}

        {activeData?.status === "ready" && (
          <div
            className={
              cardLayout === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
                : "flex flex-col gap-3"
            }
          >
            {activeData.items.map((item, idx) => (
              <InsightCard key={idx} tone={item.tone} title={item.title} body={item.body} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightCard({
  tone,
  title,
  body,
}: {
  tone: InsightTone;
  title: string;
  body: string;
}) {
  const { t } = useTranslation();
  const border =
    tone === "primary"
      ? "border-l-primary"
      : tone === "warning"
        ? "border-l-warning"
        : "border-l-destructive";
  const badge =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : "bg-destructive/10 text-destructive";
  return (
    <div className={`p-3 bg-muted/40 rounded-md border-l-2 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge}`}>
          {t(`dashboard.insights.tones.${tone}`)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </div>
  );
}