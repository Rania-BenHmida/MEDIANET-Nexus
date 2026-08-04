import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ReportSection } from "@/components/ReportSection";
import { EMBEDS } from "@/lib/embeds";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { ListChecks, Clock, AlertCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  if (!canAccess("projects", roles)) return <Navigate to="/unauthorized" />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("projects.eyebrow")}
        title={t("projects.title")}
        description={t("projects.description")}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label={t("projects.kpi.active")} value="42" icon={ListChecks} />
        <KpiCard label={t("projects.kpi.onSchedule")} value="33" delta="78%" tone="success" trend="up" icon={CheckCircle2} />
        <KpiCard label={t("projects.kpi.atRisk")} value="6" delta="+2" tone="warning" trend="up" icon={Clock} />
        <KpiCard label={t("projects.kpi.delayed")} value="3" delta="-1" tone="destructive" trend="down" icon={AlertCircle} />
      </div>
      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <ReportSection reports={EMBEDS.projects} />
      </div>
    </div>
  );
}
