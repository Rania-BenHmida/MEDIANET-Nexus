import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ReportSection } from "@/components/ReportSection";
import { InsightsPanel } from "@/components/InsightsPanel";
import { EMBEDS } from "@/lib/embeds";
import { useAuth } from "@/hooks/use-auth";
import { accessibleInsightCategories, canAccess } from "@/lib/roles";
import { useProjectsStats } from "@/hooks/use-projects";
import { ListChecks, CheckCircle2, TrendingUp, CalendarClock, ListTodo, Plus, List } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

// Brand palette confirmed from the .pbix files — reused here so the KPI
// strip visually matches the embedded Power BI report below it.
const BRAND = {
  blue:   "#2E5FD9",
  teal:   "#3EC8C8",
  orange: "#F5A623",
  purple: "#8C5AC8",
  navy:   "#1B2A5B",
};

function ProjectsPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  const { data: stats, isLoading, isError } = useProjectsStats();

  if (!canAccess("projects", roles)) return <Navigate to="/unauthorized" />;

  // "projects" insight category. Shown to project_manager/admin (who have
  // no other place to see it) and to superadmin (who has access to
  // everything and wants it visible everywhere it applies). Only executive
  // stays centralized-only on /dashboard, since that page is its whole
  // reason for existing.
  const insightCategories = accessibleInsightCategories(roles).filter((c) => c === "projects");
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
          Failed to load project stats. Make sure the Django backend is running.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("projects.eyebrow")}
        title={t("projects.title")}
        description={t("projects.description")}
        actions={
          <Link
            to="/projects/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all duration-200 shrink-0"
            style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
          >
            <Plus className="w-4 h-4" />
            New Project
          </Link>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard
          compact
          label={t("projects.kpi.active")}
          value={stats.activeProjects.toLocaleString()}
          icon={ListChecks}
          accent={BRAND.blue}
        />
        <KpiCard
          compact
          label={t("projects.kpi.completed")}
          value={`${stats.completedPct}%`}
          icon={CheckCircle2}
          accent={BRAND.teal}
        />
        <KpiCard
          compact
          label={t("projects.kpi.productivity")}
          value={`${stats.teamProductivityPct}%`}
          icon={TrendingUp}
          accent={BRAND.orange}
        />
        <KpiCard
          compact
          label={t("projects.kpi.duration")}
          value={stats.avgDurationDays != null ? `${stats.avgDurationDays} Days` : "—"}
          icon={CalendarClock}
          accent={BRAND.purple}
        />
        <KpiCard
          compact
          label={t("projects.kpi.tasksPerProject")}
          value={`${stats.tasksPerProject.toLocaleString()} Tasks`}
          icon={ListTodo}
          accent={BRAND.navy}
        />
      </div>

      {showInsights && (
        <div className="mb-8">
          <InsightsPanel categories={insightCategories} />
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <ReportSection
          reports={EMBEDS.projects}
          actions={
            <Link to="/projects/list" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <List className="size-3.5" /> All Projects
            </Link>
          }
        />
      </div>
    </div>
  );
}