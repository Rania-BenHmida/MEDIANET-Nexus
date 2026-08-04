import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ReportSection } from "@/components/ReportSection";
import { EMBEDS } from "@/lib/embeds";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { useDealsStats } from "@/hooks/use-deals";
import { TrendingUp, DollarSign, Target, Users, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/deals/")({
  component: DealsPage,
});

function DealsPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  const { data: stats, isLoading, isError } = useDealsStats();

  if (!canAccess("deals", roles)) return <Navigate to="/unauthorized" />;

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-24 animate-pulse" />
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <Plus className="w-4 h-4" />
          New Deal
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label={t("deals.kpi.pipeline")}
          value={formatCompactNumber(stats.pipelineValue)}
          icon={DollarSign}
        />
        <KpiCard
          label={t("deals.kpi.open")}
          value={stats.openDeals.toLocaleString()}
          icon={Target}
        />
        <KpiCard
          label={t("deals.kpi.winRate")}
          value={`${stats.winRate}%`}
          delta={`${stats.winRateChange >= 0 ? "+" : ""}${stats.winRateChange}%`}
          tone={stats.winRateChange >= 0 ? "success" : "warning"}
          trend={stats.winRateChange >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />
        <KpiCard
          label={t("deals.kpi.uniqueClients")}
          value={stats.uniqueClients.toLocaleString()}
          icon={Users}
        />
      </div>

      {/* PowerBI report */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <ReportSection reports={EMBEDS.deals} />
      </div>
    </div>
  );
}