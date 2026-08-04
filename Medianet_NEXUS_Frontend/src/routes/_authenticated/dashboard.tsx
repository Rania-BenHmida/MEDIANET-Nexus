import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ReportSection } from "@/components/ReportSection";
import { EMBEDS } from "@/lib/embeds";
import { useAuth } from "@/hooks/use-auth";
import { DollarSign, Briefcase, AlertTriangle, Activity, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const first = profile?.displayName?.split(" ")[0] ?? "there";

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.greeting", { name: first })}
        description={t("dashboard.description")}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label={t("dashboard.kpi.totalRevenue")} value="$14.29M" delta="+12.4%" trend="up" tone="success" icon={DollarSign} />
        <KpiCard label={t("dashboard.kpi.activeDeals")} value="184" delta={t("dashboard.kpi.stable")} tone="default" icon={Briefcase} />
        <KpiCard label={t("dashboard.kpi.churnRisk")} value="4.2%" delta={t("dashboard.kpi.high")} tone="destructive" trend="up" icon={AlertTriangle} />
        <KpiCard label={t("dashboard.kpi.projectHealth")} value="92%" delta={t("dashboard.kpi.onTrack")} tone="success" icon={Activity} />
      </div>

      
        

        <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="size-3.5 text-primary" /> {t("dashboard.insights.title")}
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground">{t("dashboard.insights.updated")}</span>
          </div>
          <div className="space-y-3">
            <InsightCard tone="primary" title={t("dashboard.insights.revenueTitle")} body={t("dashboard.insights.revenueBody")} />
            <InsightCard tone="warning" title={t("dashboard.insights.migrationTitle")} body={t("dashboard.insights.migrationBody")} />
            <InsightCard tone="destructive" title={t("dashboard.insights.dachTitle")} body={t("dashboard.insights.dachBody")} />
          </div>
        </div>
      
    </div>
  );
}

function InsightCard({
  tone,
  title,
  body,
}: {
  tone: "primary" | "warning" | "destructive";
  title: string;
  body: string;
}) {
  const border =
    tone === "primary"
      ? "border-l-primary"
      : tone === "warning"
        ? "border-l-warning"
        : "border-l-destructive";
  return (
    <div className={`p-3 bg-muted/40 rounded-md border-l-2 ${border}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </div>
  );
}