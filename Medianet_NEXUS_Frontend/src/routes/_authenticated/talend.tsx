import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, CheckCircle2, XCircle, Loader2, History,
  Clock, User, Timer,
} from "lucide-react";
import { useTalendRefresh, useEtlLastRun, useEtlHistory } from "@/hooks/use-etl";
import type { EtlHistoryEntry } from "@/lib/api/etl";

export const Route = createFileRoute("/_authenticated/talend")({
  component: TalendPage,
});

// Same brand palette as Reports/Projects/Customers/Deals.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(started: string | null, finished: string | null) {
  if (!started || !finished) return "—";
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function statusBadge(status: EtlHistoryEntry["status"]) {
  const meta =
    status === "success" ? { label: "Success", color: BRAND.teal }
    : status === "failed" ? { label: "Failed", color: BRAND.coral }
    : { label: "Running", color: BRAND.orange };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
      style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// One combined "who/what started it" cell instead of two separate technical
// columns — reads like a sentence rather than a system log.
function startedByCell(run: EtlHistoryEntry) {
  if (run.trigger_type === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Timer className="size-3.5" style={{ color: BRAND.purple }} />
        Automatic (every 2 days)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <User className="size-3.5" style={{ color: BRAND.blue }} />
      {run.triggered_by || "Someone on the team"}
    </span>
  );
}

// A softer, quieter stat than the dashboard-style KpiCard — no heavy
// mono font or bold caps, just an icon circle + label + value, sitting in
// one shared strip with dividers instead of three separate boxed cards.
function StatCell({
  icon: Icon,
  label,
  value,
  accent,
  spin,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  accent: string;
  spin?: boolean;
}) {
  return (
    <div className="flex items-center gap-3.5 px-6 py-5">
      <div className="size-10 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: `${accent}14` }}>
        <Icon className={spin ? "size-4.5 animate-spin" : "size-4.5"} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground tracking-wide">{label}</p>
        <p className="text-base font-semibold tracking-tight truncate" style={{ color: accent }}>{value}</p>
      </div>
    </div>
  );
}

function TalendPage() {
  const { roles, user } = useAuth();
  const { t } = useTranslation();
  const { start, isRunning, status, reset } = useTalendRefresh();
  const { data: lastRun } = useEtlLastRun();
  const { data: history, isLoading: historyLoading } = useEtlHistory(20);

  if (!canAccess("talend", roles)) return <Navigate to="/unauthorized" />;

  // The outcome shows up via the notification bell (backend calls notify()
  // on completion) — no separate toast here, to avoid a duplicate popup
  // alongside the bell alert for the same event. Just reset the in-flight
  // jobId once it settles so a second click starts a fresh poll cycle.
  useEffect(() => {
    if (status?.status === "success" || status?.status === "failed") {
      reset();
    }
  }, [status, reset]);

  // While a job is actively running, prefer its live status over the
  // (now-stale) persisted last-run record for the stat cards.
  const displayStatus = isRunning ? "running" : lastRun?.status;
  const displayTimestamp = isRunning ? null : lastRun?.finished_at;

  const statusValue = isRunning ? "Running…" : displayStatus === "success" ? "Success" : displayStatus === "failed" ? "Failed" : "No runs yet";
  const statusAccent = isRunning ? BRAND.orange : displayStatus === "success" ? BRAND.teal : displayStatus === "failed" ? BRAND.coral : BRAND.navy;
  const StatusIcon = isRunning ? Loader2 : displayStatus === "success" ? CheckCircle2 : displayStatus === "failed" ? XCircle : Clock;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        eyebrow={t("talend.eyebrow")}
        title={t("talend.title")}
        description={t("talend.description")}
        actions={
          <Button
            onClick={() => start(user?.name || user?.email || "")}
            disabled={isRunning}
            style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`, border: "none" }}
            className="gap-2 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <RefreshCw className={isRunning ? "size-4 animate-spin" : "size-4"} />
            {isRunning ? t("talend.refreshing") : t("talend.refreshButton")}
          </Button>
        }
      />

      <div className="bg-card border border-border rounded-2xl shadow-[var(--shadow-card)] grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <StatCell
          label="Status of the last run"
          value={statusValue}
          icon={StatusIcon}
          accent={statusAccent}
          spin={isRunning}
        />
        <StatCell
          label={t("talend.lastRun")}
          value={displayTimestamp ? fmtDateTime(displayTimestamp) : t("talend.lastRunNever")}
          icon={Clock}
          accent={BRAND.blue}
        />
        <StatCell
          label="Total refreshes"
          value={String(history?.results.length ?? 0)}
          icon={History}
          accent={BRAND.purple}
        />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <p className="text-sm text-muted-foreground max-w-2xl">{t("talend.body")}</p>
        </div>

        {/* ── Refresh history ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-6 pt-4 pb-3">
          <div className="size-8 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${BRAND.navy}1a` }}>
            <History className="size-4" style={{ color: BRAND.navy }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Refresh history</h3>
            <p className="text-xs text-muted-foreground">Every time this ran, newest first.</p>
          </div>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /><span className="text-sm">{t("common.loading")}</span>
          </div>
        ) : !history || history.results.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Nothing here yet — run a refresh to see it logged.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Started by</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="text-left px-6 py-3 font-medium">Date</th>
                <th className="text-left px-6 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.results.map((run) => (
                <tr key={run.job_id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3.5">{startedByCell(run)}</td>
                  <td className="px-6 py-3.5">{statusBadge(run.status)}</td>
                  <td className="px-6 py-3.5 text-muted-foreground whitespace-nowrap">{fmtDateTime(run.started_at)}</td>
                  <td className="px-6 py-3.5 text-muted-foreground whitespace-nowrap">{fmtDuration(run.started_at, run.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}