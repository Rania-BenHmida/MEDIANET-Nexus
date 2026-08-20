import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { InsightsPanel } from "@/components/InsightsPanel";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { accessibleInsightCategories, canAccess } from "@/lib/roles";
import {
  DollarSign, Briefcase, AlertTriangle, FolderKanban as ProjectsIcon,
  TrendingUp, Layers, LayoutGrid,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// Same brand palette as Projects/Deals/Customers, a fourth alternation.
const BRAND = {
  orange: "#F5A623",
  blue:   "#2E5FD9",
  teal:   "#3EC8C8",
  coral:  "#F0564B",
  purple: "#8C5AC8",
};

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B DT`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M DT`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K DT`;
  return `DT ${value.toLocaleString()}`;
}

function Dashboard() {
  const { profile, roles } = useAuth();
  const { t } = useTranslation();
  const first = profile?.displayName?.split(" ")[0] ?? "there";

  const categories = accessibleInsightCategories(roles);

  const { data: stats, isLoading: statsLoading, isError: statsError } = useDashboardStats();

  if (!canAccess("dashboard", roles)) return <Navigate to="/unauthorized" />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.greeting", { name: first })}
        description={t("dashboard.description")}
        actions={
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <LayoutGrid className="size-3.5" /> Reports
          </Link>
        }
      />

      {statsLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-3.5 h-20 animate-pulse" />
          ))}
        </div>
      )}

      {statsError && !statsLoading && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-sm mb-8">
          Failed to load overview stats. Make sure the Django backend is running.
        </div>
      )}

      {stats && !statsLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <KpiCard
            compact
            label={t("dashboard.kpi.totalRevenue")}
            value={formatCompactNumber(stats.totalRevenue)}
            icon={DollarSign}
            accent={BRAND.orange}
          />
          <KpiCard
            compact
            label={t("dashboard.kpi.activeDeals")}
            value={stats.activeDeals.toLocaleString()}
            icon={Briefcase}
            accent={BRAND.blue}
          />
          <KpiCard
            compact
            label={t("dashboard.kpi.activeProjects")}
            value={stats.activeProjects.toLocaleString()}
            icon={ProjectsIcon}
            accent={BRAND.teal}
          />
          <KpiCard
            compact
            label={t("dashboard.kpi.churnRisk")}
            value={`${stats.overallChurnRate}%`}
            icon={AlertTriangle}
            accent={BRAND.coral}
          />
          <KpiCard
            compact
            label={t("dashboard.kpi.totalAccounts")}
            value={stats.totalAccounts.toLocaleString()}
            icon={Layers}
            accent={BRAND.purple}
          />
        </div>
      )}

      <InsightsPanel categories={categories} cardLayout="stacked" />
    </div>
  );
}