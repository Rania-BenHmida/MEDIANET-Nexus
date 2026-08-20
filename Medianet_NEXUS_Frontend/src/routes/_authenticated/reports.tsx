// reports.tsx — route: /_authenticated/reports
//
// Executive-only hub that unifies the Power BI report(s) already embedded on
// each entity's own root page (Projects "Reports" tab, Customers "Dashboard"
// tab, Deals "Pipeline" tab) into one view with a single tiny navbar, so an
// executive can flip through every entity's report without visiting four
// separate pages. Pulls straight from the same EMBEDS config those pages
// use — titles, descriptions and embed URLs are the single source of truth,
// never duplicated here.

import { useRef, useState } from "react";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { PowerBIEmbed, type PowerBIEmbedHandle } from "@/components/PowerBIEmbed";
import { EMBEDS, type EmbedSection, type EmbedReport } from "@/lib/embeds";
import {
  FolderKanban, Building2, Users, TrendingUp,
  RefreshCw, Maximize2, LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ExecutiveReportsPage,
});

// Same brand palette as Customers/Projects/Deals.
const BRAND = {
  blue:   "#2E5FD9",
  orange: "#F5A623",
  coral:  "#F0564B",
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
  navy:   "#1B2A5B",
};

const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

// Order + icon + color per entity — same icon language as the sidebar nav
// and the Overview page's insight tabs, so this page feels like a natural
// extension of those rather than a new visual system.
const SECTION_META: Record<EmbedSection, { label: string; icon: typeof FolderKanban; color: string }> = {
  projects:     { label: "Projects",         icon: FolderKanban, color: BRAND.blue },
  customersB2B: { label: "Customers (B2B)",  icon: Building2,     color: BRAND.purple },
  customersB2C: { label: "Customers (B2C)",  icon: Users,         color: BRAND.coral },
  deals:        { label: "Deals",            icon: TrendingUp,    color: BRAND.teal },
};

const SECTION_ORDER: EmbedSection[] = ["projects", "customersB2B", "customersB2C", "deals"];

// Flatten every section's report list into one ordered tab list. Currently
// each section has exactly one report, so this reproduces the same titles
// you already see on each entity's own root page ("Project Progress &
// Milestones", "Customer 360°", "Churn Analytics", "Deal Pipeline") — but it
// scales cleanly if a section ever grows a second report.
type Tab = { section: EmbedSection; report: EmbedReport };
const TABS: Tab[] = SECTION_ORDER.flatMap((section) =>
  EMBEDS[section].map((report) => ({ section, report })),
);

function ExecutiveReportsPage() {
  const { roles } = useAuth();
  const [activeId, setActiveId] = useState(TABS[0]?.report.id);
  const embedRefs = useRef<Record<string, PowerBIEmbedHandle | null>>({});

  if (!canAccess("reports", roles)) return <Navigate to="/unauthorized" />;

  const active = TABS.find((t) => t.report.id === activeId) ?? TABS[0];

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        eyebrow="Executive"
        title="Reports"
        description="Every entity's Power BI report in one place — the same reports each team sees on their own page, unified here."
        actions={
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <LayoutDashboard className="size-3.5" /> Overview
          </Link>
        }
      />

      {TABS.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          No reports configured yet — add entries to <code className="font-mono text-xs px-1 py-0.5 bg-muted rounded">src/lib/embeds.ts</code>.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          {/* ── tiny navbar ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border overflow-x-auto">
            {TABS.map(({ section, report }) => {
              const meta = SECTION_META[section];
              const Icon = meta.icon;
              const isActive = report.id === active?.report.id;
              return (
                <button
                  key={report.id}
                  onClick={() => setActiveId(report.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                    isActive ? "" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  style={isActive ? { backgroundColor: `${meta.color}1a`, color: meta.color } : undefined}
                >
                  <Icon className="size-3.5" />
                  {report.title}
                </button>
              );
            })}
          </div>

          {/* ── active report panel ─────────────────────────────────────── */}
          {active && (
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${SECTION_META[active.section].color}1a` }}>
                    {(() => { const Icon = SECTION_META[active.section].icon; return <Icon className="size-4" style={{ color: SECTION_META[active.section].color }} />; })()}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold tracking-tight">{active.report.title}</h3>
                    {active.report.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{active.report.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => embedRefs.current[active.report.id]?.refresh()} aria-label="Refresh report">
                    <RefreshCw className="size-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => embedRefs.current[active.report.id]?.toggleFullscreen()} aria-label="Expand">
                    <Maximize2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <PowerBIEmbed
                key={active.report.id}
                ref={(el) => { embedRefs.current[active.report.id] = el; }}
                report={active.report}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}