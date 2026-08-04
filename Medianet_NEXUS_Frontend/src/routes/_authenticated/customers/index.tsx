import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ReportSection } from "@/components/ReportSection";
import { EMBEDS } from "@/lib/embeds";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { Users, Heart, MessageSquare, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersPage,
});

function CustomersPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  if (!canAccess("customers", roles)) return <Navigate to="/unauthorized" />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("customers.eyebrow")}
        title={t("customers.title")}
        description={t("customers.description")}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label={t("customers.kpi.total")} value="12,408" delta="+3.1%" tone="success" trend="up" icon={Users} />
        <KpiCard label={t("customers.kpi.retention")} value="91.2%" delta="+0.8%" tone="success" trend="up" icon={Heart} />
        <KpiCard label={t("customers.kpi.tickets")} value="86" delta="-12" tone="success" trend="down" icon={MessageSquare} />
        <KpiCard label={t("customers.kpi.churn")} value="4.2%" delta={t("customers.kpi.high")} tone="destructive" trend="up" icon={AlertTriangle} />
      </div>
      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <ReportSection reports={EMBEDS.customers} />
      </div>
    </div>
  );
}
