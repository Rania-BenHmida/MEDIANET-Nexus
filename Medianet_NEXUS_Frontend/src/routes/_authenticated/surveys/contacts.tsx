// routes/_authenticated/surveys/contacts.tsx
// Nav label: "Client Feedback" (route path unchanged — only the AppSidebar
// label and this page's content changed; was previously empty/404).
//
// One row per company that has contacts and/or sent surveys. The
// collapsed row shows only the MAIN (most recent) survey — status +
// AI sentiment, at a glance. Expanding a row reuses <CustomerVoice />
// wholesale, so the full contacts CRUD + complete survey history + AI
// verdicts are identical to what used to live on the client fiche.

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { CustomerVoice } from "@/components/CustomerVoice";
import { useCompaniesOverview } from "@/hooks/use-surveys";
import { Input } from "@/components/ui/input";
import {
  Loader2, ChevronDown, ChevronUp, Search, Building2, Users, Send,
} from "lucide-react";
import type { SentSurveyStatus } from "@/lib/api/surveys";

const STATUS_TONE: Record<SentSurveyStatus, string> = {
  sent:      "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  expired:   "bg-muted text-muted-foreground border-border",
};

const SENTIMENT_TONE: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  neutral:  "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  negative: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  mixed:    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export const Route = createFileRoute("/_authenticated/surveys/contacts")({
  component: ClientFeedbackPage,
});

function ClientFeedbackPage() {
  const { roles } = useAuth();
  const { data: companies = [], isLoading } = useCompaniesOverview();
  const [query, setQuery] = useState("");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  if (!canAccess("surveys", roles)) return <Navigate to="/unauthorized" />;

  const filtered = useMemo(() => {
    if (!query.trim()) return companies;
    const q = query.trim().toLowerCase();
    return companies.filter((c) => c.companyName?.toLowerCase().includes(q));
  }, [companies, query]);

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6">
      <PageHeader eyebrow="Surveys" title="Client Feedback"
        description="Every client with contacts or sent surveys. Expand a row for the full history and AI verdicts." />

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
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground">
          <Building2 className="size-6 opacity-50" />
          <p className="text-sm">
            {companies.length === 0 ? "No client contacts or surveys yet." : "No clients match your search."}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {filtered.map((c) => {
            const expanded = expandedCode === c.codeCompany;
            const survey = c.latestSurvey;
            return (
              <div key={c.codeCompany}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedCode(expanded ? null : c.codeCompany)}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <Building2 className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.companyName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-3">
                        <span className="flex items-center gap-1"><Users className="size-3" /> {c.contactCount}</span>
                        <span className="flex items-center gap-1"><Send className="size-3" /> {c.surveyCount} sent</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {survey ? (
                      <>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {survey.templateName} · {fmtDate(survey.sentAt)}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${STATUS_TONE[survey.status]}`}>
                          {survey.status}
                        </span>
                        {survey.verdict?.sentiment && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${SENTIMENT_TONE[survey.verdict.sentiment] ?? ""}`}>
                            {survey.verdict.sentiment}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No surveys yet</span>
                    )}
                    {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  </div>
                </button>

                {expanded && (
                  <div className="px-5 pb-5">
                    <CustomerVoice codeCompany={c.codeCompany} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}