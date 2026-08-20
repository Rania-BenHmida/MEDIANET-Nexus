import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ReportSection } from "@/components/ReportSection";
import { InsightsPanel } from "@/components/InsightsPanel";
import { EMBEDS } from "@/lib/embeds";
import { useAuth } from "@/hooks/use-auth";
import { accessibleInsightCategories, canAccess } from "@/lib/roles";
import { useDealsStats } from "@/hooks/use-deals";
import { TrendingUp, DollarSign, Target, Users, Timer, Plus, List } from "lucide-react";

export const Route = createFileRoute("/_authenticated/deals/")({
  component: DealsPage,
});

// Same brand palette as Projects, alternated warm/cool in the opposite
// order so the two pages read as related but distinct.
const BRAND = {
  orange: "#F5A623",
  blue:   "#2E5FD9",
  coral:  "#F0564B",
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
};

function DealsPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  const { data: stats, isLoading, isError } = useDealsStats();

  if (!canAccess("deals", roles)) return <Navigate to="/unauthorized" />;

  // "revenue_deals" insight category. Shown to commercial/admin (who have
  // no other place to see it) and to superadmin (who has access to
  // everything and wants it visible everywhere it applies). Only executive
  // stays centralized-only on /dashboard, since that page is its whole
  // reason for existing.
  const insightCategories = accessibleInsightCategories(roles).filter((c) => c === "revenue_deals");
  const showInsights =
    insightCategories.length > 0 &&
    (!canAccess("dashboard", roles) || roles.includes("superadmin"));

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-3.5 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-sm">
          Failed to load deals stats. Make sure the Django backend is running.
        </div>
      </div>
    );
  }

  const formatCompactNumber = (value: number): string => {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B DT`;
    if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M DT`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K DT`;
    return `DT ${value.toLocaleString()}`;
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      {/* Header and button row */}
      <div className="flex justify-between items-center mb-6">
        <PageHeader
          eyebrow={t("deals.eyebrow")}
          title={t("deals.title")}
          description={t("deals.description")}
        />
        <Link
          to="/deals/create"
          className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all duration-200 focus:ring-2 focus:ring-offset-2"
          style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
        >
          <Plus className="w-4 h-4" />
          New Deal
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard
          compact
          label={t("deals.kpi.pipeline")}
          value={formatCompactNumber(stats.pipelineValue)}
          icon={DollarSign}
          accent={BRAND.orange}
        />
        <KpiCard
          compact
          label={t("deals.kpi.open")}
          value={stats.openDeals.toLocaleString()}
          icon={Target}
          accent={BRAND.blue}
        />
        <KpiCard
          compact
          label={t("deals.kpi.winRate")}
          value={`${stats.winRate}%`}
          delta={`${stats.winRateChange >= 0 ? "+" : ""}${stats.winRateChange}%`}
          tone={stats.winRateChange >= 0 ? "success" : "warning"}
          trend={stats.winRateChange >= 0 ? "up" : "down"}
          icon={TrendingUp}
          accent={BRAND.coral}
        />
        <KpiCard
          compact
          label={t("deals.kpi.salesCycle")}
          value={stats.avgSalesCycleDays != null ? `${stats.avgSalesCycleDays} Days` : "—"}
          icon={Timer}
          accent={BRAND.teal}
        />
        <KpiCard
          compact
          label={t("deals.kpi.uniqueClients")}
          value={stats.uniqueClients.toLocaleString()}
          icon={Users}
          accent={BRAND.purple}
        />
      </div>

      {showInsights && (
        <div className="mb-8">
          <InsightsPanel categories={insightCategories} />
        </div>
      )}

      {/* PowerBI report — "All Deals" link sits in the tab row, same style
          as the Project Overview link on projects/list.tsx */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <ReportSection
          reports={EMBEDS.deals}
          actions={
            <Link to="/deals/list" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <List className="size-3.5" /> All Deals
            </Link>
          }
        />
      </div>
    </div>
  );
}