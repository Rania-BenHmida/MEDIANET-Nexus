// customers/$companyId.tsx — route: /_authenticated/customers/$companyId
// The fiche client itself. Section 2 is conditional on relationship type:
//   - Subscribed (subscriptions.count > 0): health KPIs + loyalty/upsell breakdown
//   - Contract-based (deals.count > 0, no subs): deals-by-status summary instead
// Support (tickets) stays common to both — tickets aren't tied to either type,
// but is hidden entirely if there's no ticket history at all.

import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { KpiCard } from "@/components/KpiCard";
import { useCustomerProfile } from "@/hooks/use-customers";
import { useCompanySurveys } from "@/hooks/use-surveys";
import type { RecommendedActionCategory } from "@/lib/api/surveys";
import {
  Loader2, Building2, MapPin, Users, Calendar, Heart, TrendingUp,
  Sparkles, Clock, DollarSign, Send, Inbox, BarChart3, ArrowLeft,
} from "lucide-react";

const CATEGORY_LABEL: Record<RecommendedActionCategory, string> = {
  retention: "Retention",
  upsell:    "Upsell",
  content:   "Content / newsletter",
  outreach:  "Outreach",
  support:   "Support",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

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

// Same brand palette as Projects/Deals/Customers list.
const BRAND = {
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
  orange: "#F5A623",
  blue:   "#2E5FD9",
  coral:  "#F0564B",
  navy:   "#1B2A5B",
};

function Badge({ label, tone }: { label: string; tone: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${tone[label] ?? "bg-muted text-muted-foreground border-border"}`}>
      {label}
    </span>
  );
}

// One row of a score breakdown: full label on the left, bar+score pinned
// as a fixed-width group on the right — same right edge every row,
// regardless of how long the label text is.
function ScoreBar({ label, value, max, color, decimals = 1 }: { label: string; value: number; max: number; color: string; decimals?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      <div className="flex items-center gap-3 shrink-0">
        <div className="h-2 w-60 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
          />
        </div>
        <span className="font-semibold text-foreground tabular-nums whitespace-nowrap w-16 text-right">
          {value.toFixed(decimals)} <span className="text-muted-foreground font-normal">/ {max}</span>
        </span>
      </div>
    </div>
  );
}

// Small colored icon chip for a breakdown card's header — same visual
// language as the KpiCard icon chips elsewhere in the app.
function BreakdownHeader({ icon: Icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-6 rounded-md grid place-items-center" style={{ backgroundColor: `${color}1a` }}>
        <Icon className="size-3.5" style={{ color }} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
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
  const { data: surveys } = useCompanySurveys(profile?.company.codeCompany ?? null);

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
  const isSubscribed = subscriptions.count > 0;
  const isContractBased = !isSubscribed && deals.count > 0;

  const latestSurvey = surveys?.[0] ?? null;
  const latestVerdict = latestSurvey?.verdict ?? null;
  const hasRecommendations = latestVerdict?.status === "ready" && latestVerdict.recommendedActions.length > 0;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <Link to="/customers/list" search={{ type: "subscribed" }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to customers
      </Link>

      {/* ── 1. Identity ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {company.industry ?? "Client"}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
            {isSubscribed && (
              <div className="flex gap-2">
                <Badge label={health.tier} tone={TIER_TONE} />
                <Badge label={health.segment} tone={SEGMENT_TONE} />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {company.headquarters ?? "—"} · {company.employees ?? "—"} employees
          </p>
          {(company.revenue != null || company.yearEstablished != null) && (
            <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
              {company.revenue != null && (
                <span className="flex items-center gap-1.5">
                  <DollarSign className="size-3.5" />
                  Revenue: <span className="font-semibold text-foreground">{company.revenue.toLocaleString()} DT</span>
                </span>
              )}
              {company.yearEstablished != null && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  Est. <span className="font-semibold text-foreground">{company.yearEstablished}</span>
                </span>
              )}
            </div>
          )}
        </div>
        {isSubscribed && (
          <Link
            to="/surveys"
            search={{ company: company.codeCompany }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#2E5FD9] hover:opacity-90 text-white text-sm font-medium rounded-lg shadow-sm transition-opacity shrink-0"
          >
            <Send className="size-3.5" />
            Prepare Survey
          </Link>
        )}
      </div>

      {/* ── 2a. Santé & risque — subscribed clients only ───────────── */}
      {isSubscribed && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard compact label="Loyalty score" value={health.loyaltyScore != null ? `${health.loyaltyScore}/100` : "—"} icon={Heart} accent={BRAND.teal} />
            <KpiCard compact label="Upsell readiness" value={health.upsellReadiness != null ? `${health.upsellReadiness}/100` : "—"} icon={TrendingUp} accent={BRAND.purple} />
            <KpiCard compact label="MRR" value={`${subscriptions.mrr.toLocaleString()} DT`} icon={Building2} accent={BRAND.orange} />
            <KpiCard compact label="Tenure" value={subscriptions.tenureMonths != null ? `${Math.round(subscriptions.tenureMonths)} mo` : "—"} icon={Calendar} accent={BRAND.blue} />
          </div>

          {(health.loyaltyBreakdown || health.upsellBreakdown) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {health.loyaltyBreakdown && (
                <div className="bg-card border border-border rounded-xl p-5 space-y-4 border-t-4" style={{ borderTopColor: BRAND.teal }}>
                  <BreakdownHeader icon={Heart} label="Loyalty score — breakdown" color={BRAND.teal} />
                  <div className="space-y-2">
                    {[
                      { label: "Tenure", value: health.loyaltyBreakdown.tenure, max: 30, color: BRAND.teal },
                      { label: "Has upgraded", value: health.loyaltyBreakdown.hasUpgraded, max: 25, color: BRAND.blue },
                      { label: "Auto-renew share", value: health.loyaltyBreakdown.autoRenewShare, max: 25, color: BRAND.orange },
                      { label: "Survival (not churned)", value: health.loyaltyBreakdown.survival, max: 20, color: BRAND.purple },
                    ].map((row) => <ScoreBar key={row.label} {...row} />)}
                  </div>
                </div>
              )}
              {health.upsellBreakdown && (
                <div className="bg-card border border-border rounded-xl p-5 space-y-4 border-t-4" style={{ borderTopColor: BRAND.purple }}>
                  <BreakdownHeader icon={TrendingUp} label="Upsell readiness — breakdown" color={BRAND.purple} />
                  <div className="space-y-2">
                    {[
                      { label: "Auto-renew share", value: health.upsellBreakdown.autoRenewShare, max: 20, color: BRAND.purple },
                      { label: "Has upgraded", value: health.upsellBreakdown.hasUpgraded, max: 25, color: BRAND.blue },
                      { label: "No downgrade", value: health.upsellBreakdown.noDowngrade, max: 10, color: BRAND.teal },
                      { label: "Not all-trial", value: health.upsellBreakdown.notAllTrial, max: 10, color: BRAND.orange },
                      { label: "Tenure", value: health.upsellBreakdown.tenure, max: 15, color: BRAND.coral },
                      { label: "Usage vs. top account", value: health.upsellBreakdown.relativeUsage, max: 20, color: BRAND.purple },
                    ].map((row) => <ScoreBar key={row.label} {...row} />)}
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground -mt-2">
            Weights are provisional (not yet empirically calibrated against real churn outcomes) — shown as hypotheses, not certainty.
          </p>
        </>
      )}

      {/* ── 2b. Deals summary + status breakdown — contract-based clients only ── */}
      {isContractBased && (
        <>
          <DealsSummary deals={deals} />
          <DealsStatusCards items={deals.items} />
        </>
      )}

      {/* ── 3. Support — common to both types, hidden if there's no ticket
           history at all rather than showing a row of dead zeros ──────── */}
      {tickets.total > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Support</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div><p className="text-lg font-semibold text-foreground">{tickets.total}</p><p className="text-[11px] text-muted-foreground">Total tickets</p></div>
            <div><p className="text-lg font-semibold text-foreground">{tickets.closed}</p><p className="text-[11px] text-muted-foreground">Closed</p></div>
            <div><p className="text-lg font-semibold text-foreground">{tickets.avgResolutionHours?.toFixed(1) ?? "—"}h</p><p className="text-[11px] text-muted-foreground">Avg resolution</p></div>
            <div><p className="text-lg font-semibold text-foreground">{tickets.avgSatisfaction?.toFixed(1) ?? "—"}</p><p className="text-[11px] text-muted-foreground">Avg satisfaction</p></div>
          </div>
        </div>
      )}

      {/* ── 5. Actions recommandées — from the latest survey verdict, ─
           falls back to a placeholder if no survey has been run yet ── */}
      {hasRecommendations && latestVerdict ? (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended actions</p>
            <span className="text-[11px] text-muted-foreground">
              From {latestSurvey?.templateName ?? "latest survey"} · {fmtDate(latestSurvey?.completedAt ?? latestSurvey?.sentAt ?? null)}
            </span>
          </div>
          <div className="space-y-2">
            {latestVerdict.recommendedActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary shrink-0">
                  {CATEGORY_LABEL[a.category] ?? a.category}
                </span>
                <span className="text-foreground">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ComingSoon icon={Sparkles} title="Recommended actions"
          note={
            latestSurvey
              ? "The latest survey hasn't had its AI verdict run yet — do that from the Voice of the Customer panel to see recommendations here."
              : "No survey has been sent to this client yet — recommended actions will appear here once one is run."
          } />
      )}
    </div>
  );
}

// ── Deals-by-status summary, for contract-based clients ──────────────────
function DealsSummary({ deals }: { deals: { count: number; items: { id: number; value: number | null; stage: string | null; isClosed: boolean | null; isWon: boolean | null }[] } }) {
  const stats = useMemo(() => {
    const won = deals.items.filter((d) => d.isWon).length;
    const lost = deals.items.filter((d) => d.isClosed && !d.isWon).length;
    const open = deals.items.filter((d) => !d.isClosed).length;
    const wonValue = deals.items.filter((d) => d.isWon).reduce((sum, d) => sum + (d.value ?? 0), 0);
    const decided = won + lost; // closed deals only — open ones haven't been decided yet
    const winRate = decided > 0 ? Math.round((100 * won) / decided) : null;
    const avgDealSize = won > 0 ? Math.round(wonValue / won) : null;
    return { open, wonValue, winRate, avgDealSize };
  }, [deals.items]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard compact label="Open deals" value={stats.open.toLocaleString()} icon={Clock} accent={BRAND.orange} />
      <KpiCard compact label="Won value" value={`${stats.wonValue.toLocaleString()} DT`} icon={DollarSign} accent={BRAND.blue} />
      <KpiCard compact label="Win rate" value={stats.winRate != null ? `${stats.winRate}%` : "—"} icon={TrendingUp} accent={BRAND.purple} />
      <KpiCard compact label="Avg deal size" value={stats.avgDealSize != null ? `${stats.avgDealSize.toLocaleString()} DT` : "—"} icon={BarChart3} accent={BRAND.navy} />
    </div>
  );
}

// ── Closed (Won/Lost) and Open (by stage) breakdown, for contract-based
// clients — two cards, counts not revenue, same bar style as the score
// breakdowns elsewhere on this page.
function DealsStatusCards({ items }: { items: { id: number; value: number | null; stage: string | null; isClosed: boolean | null; isWon: boolean | null }[] }) {
  const closedItems = items.filter((d) => d.isClosed);
  const openItems = items.filter((d) => !d.isClosed);

  const closedRows = useMemo(() => {
    const won = closedItems.filter((d) => d.isWon).length;
    const lost = closedItems.length - won;
    return [
      { label: "Won", value: won, color: BRAND.teal },
      { label: "Lost", value: lost, color: BRAND.coral },
    ];
  }, [closedItems]);

  const openRows = useMemo(() => {
    const byStage = new Map<string, number>();
    openItems.forEach((d) => {
      const key = d.stage ?? "Unknown";
      byStage.set(key, (byStage.get(key) ?? 0) + 1);
    });
    const palette = [BRAND.orange, BRAND.blue, BRAND.purple, BRAND.navy, BRAND.coral, BRAND.teal];
    return Array.from(byStage.entries()).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
  }, [openItems]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BreakdownCard title={`Closed Deals (${closedItems.length})`} rows={closedRows} accent={BRAND.teal} />
      <BreakdownCard title={`Open Deals (${openItems.length})`} rows={openRows} accent={BRAND.orange} />
    </div>
  );
}

function BreakdownCard({
  title, rows, accent,
}: {
  title: string;
  rows: { label: string; value: number; color: string }[];
  accent: string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4 border-t-4" style={{ borderTopColor: accent }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Inbox className="size-5 opacity-50" />
          <p className="text-xs">Nothing here yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground font-medium">{r.label}</span>
              <div className="flex items-center gap-3 shrink-0">
                <div className="h-2 w-60 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${(r.value / max) * 100}%`, background: `linear-gradient(90deg, ${r.color}99, ${r.color})` }}
                  />
                </div>
                <span className="font-semibold text-foreground tabular-nums whitespace-nowrap w-16 text-right">{r.value}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}