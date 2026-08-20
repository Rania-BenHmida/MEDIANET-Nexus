// routes/_authenticated/surveys/contacts.tsx
// Nav label: "Client Feedback" (route path unchanged — only the AppSidebar
// label and this page's content changed; was previously empty/404).
//
// One card per company that has contacts and/or sent surveys, split into
// two groups:
//   - Answered: latest survey status === "completed" — the AI verdict
//     (score + sentiment) shows immediately on the collapsed card, no
//     click needed. Sorted lowest score first so at-risk clients surface
//     to the top.
//   - Not answered yet: never sent, sent-but-pending, or expired — shows
//     the report status instead of a verdict. Sorted so "sent, waiting on
//     a reply" comes before "never sent at all".
// Expanding a card reuses <CustomerVoice /> wholesale, so the full
// contacts CRUD + complete survey history + AI verdicts (and now, delete)
// are identical to what used to live on the client fiche.

import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { CustomerVoice } from "@/components/CustomerVoice";
import { useCompaniesOverview, useCleanupRuns } from "@/hooks/use-surveys";
import { Input } from "@/components/ui/input";
import {
  Loader2, ChevronDown, ChevronUp, Search, Building2, Users, Send,
  Sparkles, Clock, AlertTriangle, History, Trash2, FlaskConical,
} from "lucide-react";
import type { CompanyFeedbackOverview, SentSurveyStatus, SurveyCleanupRun } from "@/lib/api/surveys";

// Same brand palette as the rest of NEXUS.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};

const STATUS_COLOR: Record<SentSurveyStatus, string> = {
  sent:      BRAND.blue,
  completed: BRAND.teal,
  expired:   "#8a8f98",
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: BRAND.teal,
  neutral:  BRAND.blue,
  negative: BRAND.coral,
  mixed:    BRAND.orange,
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// Colored section header — dot/icon + label + count + fading rule line,
// same visual language used across the Surveys admin pages.
function SectionLabel({ children, color, icon: Icon, count }: { children: React.ReactNode; color: string; icon: typeof Sparkles; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-3.5 shrink-0" style={{ color }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color }}>
        {children} · {count}
      </span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}44, transparent)` }} />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/surveys/contacts")({
  // Optional ?company=<codeCompany> — set when arriving here via a "View
  // this client's feedback" link from the Prepare Survey page, so that
  // company's card is auto-expanded and scrolled to on load.
  validateSearch: (search: Record<string, unknown>): { company?: string } => ({
    company: typeof search.company === "string" ? search.company : undefined,
  }),
  component: ClientFeedbackPage,
});

function ClientFeedbackPage() {
  const { roles } = useAuth();
  const { company: preselectCode } = Route.useSearch();
  const { data: companies = [], isLoading, isError, refetch } = useCompaniesOverview();
  const [query, setQuery] = useState("");
  const [expandedCode, setExpandedCode] = useState<string | null>(preselectCode ?? null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Once the overview data loads, scroll the preselected company's card
  // into view — the card itself is already expanded from initial state.
  useEffect(() => {
    if (!preselectCode || companies.length === 0) return;
    cardRefs.current[preselectCode]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [preselectCode, companies.length]);

  if (!canAccess("surveys", roles)) return <Navigate to="/unauthorized" />;

  const filtered = useMemo(() => {
    if (!query.trim()) return companies;
    const q = query.trim().toLowerCase();
    return companies.filter((c) => c.companyName?.toLowerCase().includes(q));
  }, [companies, query]);

  // Answered = the latest survey was actually completed (so there's real
  // feedback + potentially a verdict). Sorted lowest overall score first —
  // the clients most worth a CS team's attention surface to the top.
  const answered = useMemo(() => {
    return filtered
      .filter((c) => c.latestSurvey?.status === "completed")
      .sort((a, b) => {
        const scoreA = a.latestSurvey?.verdict?.overallScore ?? 999;
        const scoreB = b.latestSurvey?.verdict?.overallScore ?? 999;
        return scoreA - scoreB;
      });
  }, [filtered]);

  // Not answered = never sent, sent and still pending, or expired without
  // a response. "Sent, waiting" surfaces above "never sent at all" since
  // those are the ones actually worth a follow-up nudge.
  const notAnswered = useMemo(() => {
    return filtered
      .filter((c) => c.latestSurvey?.status !== "completed")
      .sort((a, b) => {
        const rank = (c: CompanyFeedbackOverview) => (c.latestSurvey?.status === "sent" ? 0 : c.latestSurvey?.status === "expired" ? 1 : 2);
        return rank(a) - rank(b);
      });
  }, [filtered]);

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6">
      <PageHeader eyebrow="Surveys" title="Client Feedback"
        description="Every client with contacts or sent surveys. The AI verdict shows right away for anyone who's answered — expand a card for the full history." />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by company…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading clients…</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <AlertTriangle className="size-6" style={{ color: BRAND.coral }} />
          <p className="text-sm">Couldn't load client feedback. Is the Django server running?</p>
          <button onClick={() => refetch()} className="text-sm font-medium hover:underline" style={{ color: BRAND.blue }}>
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground">
          <Building2 className="size-6 opacity-50" />
          <p className="text-sm">
            {companies.length === 0 ? "No client contacts or surveys yet." : "No clients match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {answered.length > 0 && (
            <div>
              <SectionLabel color={BRAND.teal} icon={Sparkles} count={answered.length}>Answered</SectionLabel>
              <div className="space-y-3">
                {answered.map((c) => (
                  <CompanyFeedbackCard
                    key={c.codeCompany}
                    company={c}
                    expanded={expandedCode === c.codeCompany}
                    onToggle={() => setExpandedCode(expandedCode === c.codeCompany ? null : c.codeCompany)}
                    cardRef={(el) => { cardRefs.current[c.codeCompany] = el; }}
                  />
                ))}
              </div>
            </div>
          )}

          {notAnswered.length > 0 && (
            <div>
              <SectionLabel color={BRAND.navy} icon={Clock} count={notAnswered.length}>Not answered yet</SectionLabel>
              <div className="space-y-3">
                {notAnswered.map((c) => (
                  <CompanyFeedbackCard
                    key={c.codeCompany}
                    company={c}
                    expanded={expandedCode === c.codeCompany}
                    onToggle={() => setExpandedCode(expandedCode === c.codeCompany ? null : c.codeCompany)}
                    cardRef={(el) => { cardRefs.current[c.codeCompany] = el; }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CleanupHistoryCard />
    </div>
  );
}

// ── company card — verdict (or status) is visible the instant the page
// loads, no click required. ──────────────────────────────────────────────

function CompanyFeedbackCard({
  company: c, expanded, onToggle, cardRef,
}: {
  company: CompanyFeedbackOverview;
  expanded: boolean;
  onToggle: () => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const survey = c.latestSurvey;
  const verdict = survey?.verdict;
  const hasVerdict = !!verdict && verdict.status === "ready";
  const sentimentColor = verdict?.sentiment ? SENTIMENT_COLOR[verdict.sentiment] ?? BRAND.navy : BRAND.navy;

  return (
    <div ref={cardRef} className="bg-card border border-border rounded-xl overflow-hidden">
      {/* A <div> here, not a <button> — it needs to contain the "Prepare
          survey" link, and a link nested inside a button is invalid HTML.
          role/tabIndex/onKeyDown keep it keyboard-accessible. */}
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      >
        {/* AI verdict — the main feature of this page, so it's the first
            thing in the row, not an afterthought at the end. */}
        {hasVerdict ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl px-4 py-2 shrink-0 min-w-[76px]"
            style={{ backgroundColor: `${sentimentColor}14` }}
          >
            <span className="text-xl font-bold tabular-nums" style={{ color: sentimentColor }}>
              {verdict.overallScore != null ? verdict.overallScore.toFixed(0) : "—"}
            </span>
            <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Overall</span>
          </div>
        ) : survey?.status === "completed" ? (
          <div className="flex flex-col items-center justify-center rounded-xl px-4 py-2 shrink-0 min-w-[76px]" style={{ backgroundColor: `${BRAND.blue}14` }}>
            <Sparkles className="size-4" style={{ color: BRAND.blue }} />
            <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mt-0.5">No verdict</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl px-4 py-2 shrink-0 min-w-[76px] bg-muted/50">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mt-0.5">
              {survey ? survey.status : "None sent"}
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Building2 className="size-3.5 text-muted-foreground shrink-0" />
            <p className="text-sm font-medium text-foreground truncate">{c.companyName}</p>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1"><Users className="size-3" /> {c.contactCount}</span>
            <span className="flex items-center gap-1"><Send className="size-3" /> {c.surveyCount} sent</span>
            {survey && <span>{survey.templateName} · {fmtDate(survey.sentAt)}</span>}
          </p>
          {hasVerdict && verdict.summary && (
            <p className="text-xs text-foreground mt-1.5 line-clamp-1">{verdict.summary}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {survey ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize"
              style={{ backgroundColor: `${STATUS_COLOR[survey.status]}14`, color: STATUS_COLOR[survey.status], borderColor: `${STATUS_COLOR[survey.status]}33` }}
            >
              {survey.status}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No surveys yet</span>
          )}
          {hasVerdict && verdict.sentiment && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize"
              style={{ backgroundColor: `${sentimentColor}14`, color: sentimentColor, borderColor: `${sentimentColor}33` }}
            >
              {verdict.sentiment}
            </span>
          )}
          <Link
            to="/surveys"
            search={{ company: c.codeCompany }}
            onClick={(e) => e.stopPropagation()}
            className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label="Prepare a survey for this client"
            title="Prepare a survey for this client"
          >
            <Send className="size-3.5" />
          </Link>
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5">
          <CustomerVoice codeCompany={c.codeCompany} />
        </div>
      )}
    </div>
  );
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Quarterly cleanup audit trail — every cleanup_old_surveys execution,
// real or --dry-run, so the retention policy is demonstrable, not just a
// script running invisibly in the background. ──────────────────────────

function CleanupHistoryCard() {
  const [open, setOpen] = useState(false);
  const { data: runs = [], isLoading } = useCleanupRuns();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <History className="size-3.5" /> Quarterly cleanup history
          {runs.length > 0 && <span className="normal-case font-normal text-muted-foreground/70">· {runs.length} run{runs.length === 1 ? "" : "s"}</span>}
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground mb-3">
            Unanswered surveys older than a quarter are cleared out automatically — completed ones are never touched.
          </p>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="size-3.5 animate-spin" /> Loading history…
            </div>
          ) : runs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">No cleanup runs recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => <CleanupRunRow key={r.id} run={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CleanupRunRow({ run }: { run: SurveyCleanupRun }) {
  const [expanded, setExpanded] = useState(false);
  const color = run.wasDryRun ? BRAND.orange : run.deletedCount > 0 ? BRAND.coral : "#8a8f98";
  const Icon = run.wasDryRun ? FlaskConical : Trash2;
  const hasDetails = run.details.length > 0;

  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        style={{ cursor: hasDetails ? "pointer" : "default" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
            style={{ backgroundColor: `${color}14`, color }}
          >
            <Icon className="size-3" /> {run.wasDryRun ? "Dry run" : "Deleted"}
          </span>
          <span className="text-xs text-muted-foreground truncate">{fmtDateTime(run.ranAt)}</span>
          <span className="text-[11px] text-muted-foreground/70">· cutoff {run.cutoffDays}d</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold" style={{ color }}>{run.deletedCount} survey{run.deletedCount === 1 ? "" : "s"}</span>
          {hasDetails && (expanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />)}
        </div>
      </button>
      {expanded && hasDetails && (
        <div className="px-3 pb-2.5 space-y-1">
          {run.details.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1">
              <span className="truncate">#{d.id} {d.template} · {d.codeCompany}</span>
              <span className="shrink-0 capitalize">{d.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}