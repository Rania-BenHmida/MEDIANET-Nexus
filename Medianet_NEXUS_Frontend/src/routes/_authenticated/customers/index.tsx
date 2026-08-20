import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ReportSection } from "@/components/ReportSection";
import { InsightsPanel } from "@/components/InsightsPanel";
import { EMBEDS } from "@/lib/embeds";
import { useAuth } from "@/hooks/use-auth";
import { accessibleInsightCategories, canAccess } from "@/lib/roles";
import { useCustomersB2BStats, useCustomersB2CStats } from "@/hooks/use-customers";
import { Building2, DollarSign, AlertTriangle, ShieldCheck, Flag, Star, ShieldAlert, TrendingDown, Plus, List } from "lucide-react";

type Segment = "b2b" | "b2c";

export const Route = createFileRoute("/_authenticated/customers/")({
  // Tab state lives in the URL (?segment=b2b|b2c) — bookmarkable, shareable,
  // and browser back/forward just works. Defaults to b2b for any unknown value.
  validateSearch: (search: Record<string, unknown>): { segment: Segment } => ({
    segment: search.segment === "b2c" ? "b2c" : "b2b",
  }),
  component: CustomersPage,
});

// Same brand palette as Projects/Deals. B2B and B2C use different orderings
// of the same 5 colors so the two tabs feel related but distinct.
const BRAND_B2B = {
  teal:   "#3EC8C8",
  orange: "#F5A623",
  coral:  "#F0564B",
  purple: "#8C5AC8",
  blue:   "#2E5FD9",
};
const BRAND_B2C = {
  blue:   "#2E5FD9",
  orange: "#F5A623",
  coral:  "#F0564B",
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
};

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B DT`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M DT`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K DT`;
  return `DT ${value.toLocaleString()}`;
}

function CustomersPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  const { segment } = Route.useSearch();
  const navigate = Route.useNavigate();

  if (!canAccess("customers", roles)) return <Navigate to="/unauthorized" />;

  const setSegment = (next: Segment) => navigate({ search: { segment: next } });

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("customers.eyebrow")}
        title={t("customers.title")}
        description={t("customers.description")}
        actions={
          <Link
            to="/customers/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all duration-200 shrink-0"
            style={{ background: "linear-gradient(90deg, #2E5FD9, #8C5AC8)" }}
          >
            <Plus className="w-4 h-4" />
            New Client
          </Link>
        }
      />

      {/* Tiny segment nav */}
      <div className="inline-flex items-center gap-1 p-1 mb-6 bg-muted rounded-lg">
        <button
          onClick={() => setSegment("b2b")}
          className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
            segment === "b2b" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("customers.tabs.b2b")}
        </button>
        <button
          onClick={() => setSegment("b2c")}
          className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
            segment === "b2c" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("customers.tabs.b2c")}
        </button>
      </div>

      {segment === "b2b" ? <B2BSegment /> : <B2CSegment />}
    </div>
  );
}

function B2BSegment() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const { data: stats, isLoading, isError } = useCustomersB2BStats();

  // "customer_churn_b2b" insight category. Shown to customer_success/admin
  // (who have no other place to see it) and to superadmin (who has access
  // to everything and wants it visible everywhere it applies). Only
  // executive stays centralized-only on /dashboard.
  const insightCategories = accessibleInsightCategories(roles).filter((c) => c === "customer_churn_b2b");
  const showInsights =
    insightCategories.length > 0 &&
    (!canAccess("dashboard", roles) || roles.includes("superadmin"));

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-3.5 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-sm mb-8">
        Failed to load B2B customer stats. Make sure the Django backend is running.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard
          compact
          label={t("customers.kpi.arr")}
          value={formatCompactNumber(stats.arrAccumulated)}
          delta={`+${formatCompactNumber(stats.arrAdded)} ${stats.arrYear}`}
          tone="success"
          trend="up"
          icon={DollarSign}
          accent={BRAND_B2B.orange}
        />
        <KpiCard
          compact
          label={t("customers.kpi.companies")}
          value={stats.totalCompanies.toLocaleString()}
          icon={Building2}
          accent={BRAND_B2B.teal}
        />
        <KpiCard
          compact
          label={t("customers.kpi.churnRate")}
          value={`${stats.churnRate}%`}
          icon={AlertTriangle}
          accent={BRAND_B2B.coral}
        />
        <KpiCard
          compact
          label={t("customers.kpi.fidelity")}
          value={`${stats.fidelityRate}%`}
          icon={ShieldCheck}
          accent={BRAND_B2B.purple}
        />
        <KpiCard
          compact
          label={t("customers.kpi.escalatedTickets")}
          value={stats.escalatedTickets.toLocaleString()}
          icon={Flag}
          accent={BRAND_B2B.blue}
        />
      </div>

      {showInsights && (
        <div className="mb-8">
          <InsightsPanel categories={insightCategories} />
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <ReportSection
          reports={EMBEDS.customersB2B}
          actions={
            <Link to="/customers/list" search={{ type: "subscribed" }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <List className="size-3.5" /> All Customers
            </Link>
          }
        />
      </div>
    </>
  );
}

function B2CSegment() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const { data: stats, isLoading, isError } = useCustomersB2CStats();

  // "customer_churn_b2c" insight category — same gating pattern as B2B above.
  const insightCategories = accessibleInsightCategories(roles).filter((c) => c === "customer_churn_b2c");
  const showInsights =
    insightCategories.length > 0 &&
    (!canAccess("dashboard", roles) || roles.includes("superadmin"));

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-3.5 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-sm mb-8">
        Failed to load B2C customer stats. Make sure the Django backend is running.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard
          compact
          label={t("customers.kpi.totalRevenue")}
          value={formatCompactNumber(stats.totalRevenue)}
          icon={DollarSign}
          accent={BRAND_B2C.orange}
        />
        <KpiCard
          compact
          label={t("customers.kpi.churnRate")}
          value={`${stats.churnRate}%`}
          icon={AlertTriangle}
          accent={BRAND_B2C.coral}
        />
        <KpiCard
          compact
          label={t("customers.kpi.churnRevenueRate")}
          value={`${stats.churnRevenueRate}%`}
          icon={TrendingDown}
          accent={BRAND_B2C.blue}
        />
        <KpiCard
          compact
          label={t("customers.kpi.avgCltv")}
          value={formatCompactNumber(stats.avgCltv)}
          icon={Star}
          accent={BRAND_B2C.teal}
        />
        <KpiCard
          compact
          label={t("customers.kpi.atRisk")}
          value={stats.atRiskCustomers.toLocaleString()}
          icon={ShieldAlert}
          accent={BRAND_B2C.purple}
        />
      </div>

      {showInsights && (
        <div className="mb-8">
          <InsightsPanel categories={insightCategories} />
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <ReportSection
          reports={EMBEDS.customersB2C}
          actions={
            <Link to="/customers/list" search={{ type: "subscribed" }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <List className="size-3.5" /> All Customers
            </Link>
          }
        />
      </div>
    </>
  );
}