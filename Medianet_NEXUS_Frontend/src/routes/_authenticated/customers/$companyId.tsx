// customers/$companyId.tsx — route: /_authenticated/customers/$companyId
// The fiche client itself.

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { useCustomerProfile } from "@/hooks/use-customers";
import {
  Loader2, Building2, MapPin, Users, Calendar, Heart, TrendingUp,
  Sparkles, Inbox,
} from "lucide-react";

const TIER_TONE: Record<string, string> = {
  "Ambassador":     "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "Established":    "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  "Developing":     "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "New / At Risk":  "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "No data":        "bg-muted text-muted-foreground border-border",
};

const SEGMENT_TONE: Record<string, string> = {
  "Loyal":   "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "Upsold":  "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  "Stable":  "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  "Trial":   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "At Risk": "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  "Churned": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "No data": "bg-muted text-muted-foreground border-border",
};

function Badge({ label, tone }: { label: string; tone: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${tone[label] ?? "bg-muted text-muted-foreground border-border"}`}>
      {label}
    </span>
  );
}

// One row of a score breakdown: label, points earned, points possible.
function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground tabular-nums">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ComingSoon({ icon: Icon, title, note }: { icon: any; title: string; note: string }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center space-y-2 opacity-70">
      <Icon className="size-5 mx-auto text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm mx-auto">{note}</p>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/customers/$companyId")({
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { roles } = useAuth();
  const { companyId } = Route.useParams();
  const { data: profile, isLoading, isError } = useCustomerProfile(Number(companyId));

  if (!canAccess("customers", roles)) return <Navigate to="/unauthorized" />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading fiche client…</span>
      </div>
    );
  }
  if (isError || !profile) {
    return <div className="p-8 text-sm text-destructive">Couldn't load this client.</div>;
  }

  const { company, subscriptions, health, tickets, deals } = profile;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* ── 1. Identity ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader eyebrow={company.industry ?? "Client"} title={company.name}
          description={`${company.headquarters ?? "—"} · ${company.employees ?? "—"} employees`} />
        <div className="flex gap-2 pt-1">
          <Badge label={health.tier} tone={TIER_TONE} />
          <Badge label={health.segment} tone={SEGMENT_TONE} />
        </div>
      </div>

      {/* ── 2. Santé & risque ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Loyalty score" value={health.loyaltyScore != null ? `${health.loyaltyScore}/100` : "—"} icon={Heart} />
        <KpiCard label="Upsell readiness" value={health.upsellReadiness != null ? `${health.upsellReadiness}/100` : "—"} icon={TrendingUp} />
        <KpiCard label="MRR" value={`$${subscriptions.mrr.toLocaleString()}`} icon={Building2} />
        <KpiCard label="Tenure" value={subscriptions.tenureMonths != null ? `${subscriptions.tenureMonths} mo` : "—"} icon={Calendar} />
      </div>

      {(health.loyaltyBreakdown || health.upsellBreakdown) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {health.loyaltyBreakdown && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loyalty score — breakdown</p>
              <ScoreBar label="Tenure" value={health.loyaltyBreakdown.tenure} max={30} />
              <ScoreBar label="Has upgraded" value={health.loyaltyBreakdown.hasUpgraded} max={25} />
              <ScoreBar label="Auto-renew share" value={health.loyaltyBreakdown.autoRenewShare} max={25} />
              <ScoreBar label="Survival (not churned)" value={health.loyaltyBreakdown.survival} max={20} />
            </div>
          )}
          {health.upsellBreakdown && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upsell readiness — breakdown</p>
              <ScoreBar label="Auto-renew share" value={health.upsellBreakdown.autoRenewShare} max={20} />
              <ScoreBar label="Has upgraded" value={health.upsellBreakdown.hasUpgraded} max={25} />
              <ScoreBar label="No downgrade" value={health.upsellBreakdown.noDowngrade} max={10} />
              <ScoreBar label="Not all-trial" value={health.upsellBreakdown.notAllTrial} max={10} />
              <ScoreBar label="Tenure" value={health.upsellBreakdown.tenure} max={15} />
              <ScoreBar label="Usage vs. top account" value={health.upsellBreakdown.relativeUsage} max={20} />
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground -mt-2">
        Weights are provisional (not yet empirically calibrated against real churn outcomes) — shown as hypotheses, not certainty.
      </p>

      {/* ── 3. Support ──────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Support</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div><p className="text-lg font-semibold text-foreground">{tickets.total}</p><p className="text-[11px] text-muted-foreground">Total tickets</p></div>
          <div><p className="text-lg font-semibold text-foreground">{tickets.closed}</p><p className="text-[11px] text-muted-foreground">Closed</p></div>
          <div><p className="text-lg font-semibold text-foreground">{tickets.avgResolutionHours?.toFixed(1) ?? "—"}h</p><p className="text-[11px] text-muted-foreground">Avg resolution</p></div>
          <div><p className="text-lg font-semibold text-foreground">{tickets.avgSatisfaction?.toFixed(1) ?? "—"}</p><p className="text-[11px] text-muted-foreground">Avg satisfaction</p></div>
        </div>
      </div>

      {/* ── Deals — empty-safe, no forced alignment ────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Deals</p>
        {deals.count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Inbox className="size-5 opacity-50" />
            <p className="text-xs">No deals recorded for this client — normal for a fully onboarded account.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deals.items.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                <span className="text-muted-foreground">{d.stage ?? "—"}</span>
                <span className="font-medium text-foreground tabular-nums">{d.value != null ? `$${d.value.toLocaleString()}` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5. Actions recommandées — placeholder ──────────────── */}
      <ComingSoon icon={Sparkles} title="Recommended actions"
        note="A cross-client rules engine (beyond per-survey AI recommendations) will appear here later." />
    </div>
  );
}