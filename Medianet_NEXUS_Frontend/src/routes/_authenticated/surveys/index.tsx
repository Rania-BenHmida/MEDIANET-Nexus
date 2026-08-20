// surveys/index.tsx — route: /_authenticated/surveys
//
// Two tabs:
//   1. Prepare Survey — the real per-company flow:
//        pick company (favorites-first dropdown, subs only) -> default
//        questions are always visible -> industry questions assemble in
//        once a company is picked -> "Prepare AI questions" adds the AI
//        batch on top -> pick/add contact -> Send.
//      No manual industry choice anywhere — it's resolved automatically
//      from the company's real DW industry the moment it's selected.
//   2. Templates    — browse/manage the default + industry building-block
//                      templates. No send-from-here anymore; the backend
//                      rejects it (is_prepared_draft required to send).

import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import {
  useSurveyTemplates, useSurveyTemplate,
  useCompaniesWithSubs, usePrepareSurvey, usePrepareAiQuestions,
  useUpdateQuestion, useDeleteQuestion,
  useClientContacts, useCreateContact, useSendSurvey,
} from "@/hooks/use-surveys";
import { useCustomersList } from "@/hooks/use-customers";
import type {
  SurveyTemplateDetail, SurveyTemplateSummary, SurveyQuestion, QuestionOrigin, ScoringDimension,
  ClientContact, CompanyWithSubs,
} from "@/lib/api/surveys";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Inbox, ClipboardList, Star, Heart, TrendingUp, Circle, Search,
  Building2, Send, Sparkles, Pencil, Check, X, Trash2, RefreshCw,
  UserPlus, ChevronsUpDown, ArrowRight, ArrowLeft, Lock, ListChecks, Filter,
  Factory, Luggage, UtensilsCrossed, HeartHandshake, Landmark, GraduationCap,
  Megaphone, UserSearch, Radio, Mail, Wrench, MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";

// ── brand ────────────────────────────────────────────────────────────────
// Same palette as Customers/Projects/Deals/Reports — kept as the single
// source of truth here too, rather than the generic sky/emerald/violet/amber
// tones this page used to lean on.

const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};

// ── industry icon — matched fuzzily against slug + label so it doesn't
// depend on knowing the backend's exact enum casing. ────────────────────
const INDUSTRY_ICON: [string[], typeof Star][] = [
  [["default", "generic", "other"], ClipboardList],
  [["manufactur"], Factory],
  [["tourism", "hospitality", "hotel"], Luggage],
  [["food", "beverage"], UtensilsCrossed],
  [["ngo", "development"], HeartHandshake],
  [["bank", "finance"], Landmark],
  [["educat"], GraduationCap],
  [["advertis", "marketing"], Megaphone],
  [["staffing", "recruit"], UserSearch],
  [["telecom"], Radio],
  [["postal", "mail", "logistics"], Mail],
  [["service"], Wrench],
];

function industryIcon(industry: string | null | undefined, industryLabel: string | null | undefined) {
  const haystack = `${industry ?? ""} ${industryLabel ?? ""}`.toLowerCase();
  for (const [keywords, Icon] of INDUSTRY_ICON) {
    if (keywords.some((k) => haystack.includes(k))) return Icon;
  }
  return Building2;
}

const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

// ── shared badges ─────────────────────────────────────────────────────

const DIMENSION_STYLE: Record<string, { label: string; color: string; icon: typeof Star }> = {
  satisfaction:     { label: "Satisfaction", color: BRAND.teal,   icon: Star },
  loyalty:          { label: "Loyalty",      color: BRAND.coral,  icon: Heart },
  upsell_readiness: { label: "Upsell",       color: BRAND.orange, icon: TrendingUp },
  none:             { label: "Context only", color: "#8a8f98",    icon: Circle },
};

function DimensionBadge({ dimension }: { dimension: ScoringDimension }) {
  const meta = DIMENSION_STYLE[dimension] ?? DIMENSION_STYLE.none;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
      style={{ backgroundColor: `${meta.color}14`, color: meta.color, borderColor: `${meta.color}33` }}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

const ORIGIN_STYLE: Record<QuestionOrigin, { label: string; color: string }> = {
  manual:       { label: "Manual",   color: "#8a8f98" },
  default:      { label: "Default",  color: BRAND.blue },
  industry:     { label: "Industry", color: BRAND.purple },
  ai_generated: { label: "AI",       color: BRAND.coral },
};

function OriginBadge({ origin }: { origin: QuestionOrigin }) {
  const meta = ORIGIN_STYLE[origin] ?? ORIGIN_STYLE.manual;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ backgroundColor: `${meta.color}14`, color: meta.color, borderColor: `${meta.color}33` }}
    >
      {meta.label}
    </span>
  );
}

// Colored section header — same visual language as the "GroupLabel" divider
// used on the create-project/create-customer forms: dot + fading rule line.
function SectionLabel({ children, color, icon: Icon }: { children: React.ReactNode; color: string; icon?: typeof Star }) {
  return (
    <div className="flex items-center gap-2">
      {Icon
        ? <Icon className="size-3.5 shrink-0" style={{ color }} />
        : <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span className="text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color }}>{children}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}44, transparent)` }} />
    </div>
  );
}

// ── favorites — reads the SAME source the customers view star toggle
// writes to (medianet-nexus:favorite-customers, an array of numeric
// customer ids). That list is id-based, so it's resolved against the
// customers list to get codeCompany strings the survey side actually uses.
const CUSTOMER_FAVORITES_KEY = "medianet-nexus:favorite-customers";

function readFavoriteCustomerIds(): number[] {
  try {
    const raw = localStorage.getItem(CUSTOMER_FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/_authenticated/surveys/")({
  // Optional ?company=<codeCompany> — set when arriving here via the
  // "Prepare Survey" button on a customer card or fiche client, so that
  // company is auto-selected in the Prepare Survey tab on load.
  validateSearch: (search: Record<string, unknown>): { company?: string } => ({
    company: typeof search.company === "string" ? search.company : undefined,
  }),
  component: SurveysPage,
});

type Mode = "prepare" | "templates";

const MODE_META: Record<Mode, { label: string; icon: typeof ClipboardList; color: string }> = {
  prepare:   { label: "Prepare Survey", icon: Sparkles,      color: BRAND.blue },
  templates: { label: "Templates",      icon: ClipboardList, color: BRAND.purple },
};

function SurveysPage() {
  const { roles } = useAuth();
  const { company } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("prepare");

  if (!canAccess("surveys", roles)) return <Navigate to="/unauthorized" />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Customer Success"
        title="Surveys"
        description="Prepare a personalized survey for a client, or manage the building-block templates."
      />

      <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${RAINBOW.join(", ")})` }} />
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            {(["prepare", "templates"] as Mode[]).map((m) => {
              const meta = MODE_META[m];
              const Icon = meta.icon;
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? "" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  style={isActive ? { backgroundColor: `${meta.color}14`, color: meta.color } : undefined}
                >
                  <Icon className="size-4" />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <Link
            to="/surveys/contacts"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <MessageSquareText className="size-4" /> All feedback
          </Link>
        </div>

        <div className="p-6">
          {mode === "prepare" ? <PrepareSurveyTab preselectCode={company} /> : <TemplatesTab />}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Templates tab — browse/manage building blocks (default + industry).
// No send widget here anymore — sending only happens via Prepare Survey.
// ══════════════════════════════════════════════════════════════════════

function TemplatesTab() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: templates = [], isLoading, isError, refetch } = useSurveyTemplates();
  const { data: detail, isLoading: detailLoading } = useSurveyTemplate(selectedId);
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
        <Loader2 className="size-4 animate-spin" /> Loading templates…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="text-sm text-destructive py-12 text-center">
        Couldn't reach the surveys API. Is the Django server running?
        <Button variant="outline" size="sm" className="ml-3" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-muted-foreground py-16">
        <Inbox className="size-8" />
        <p className="text-sm">No templates yet — run <code className="text-xs bg-muted px-1.5 py-0.5 rounded">python manage.py seed_surveys</code> on the backend.</p>
      </div>
    );
  }

  // ── detail view — reached by clicking a card ──────────────────────────
  if (selected) {
    const color = selected.isDefault ? BRAND.blue : RAINBOW[(templates.indexOf(selected) + 1) % RAINBOW.length];
    return (
      <div className="space-y-5">
        <button
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> All templates
        </button>

        <div className="rounded-xl border border-border overflow-hidden">
          {detailLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
              <Loader2 className="size-4 animate-spin" /> Loading questions…
            </div>
          )}
          {detail && !detailLoading && (
            <>
              <div
                className="flex items-start gap-3 p-6 pb-5 border-b border-border"
                style={{ background: `linear-gradient(135deg, ${color}0d, transparent)` }}
              >
                <div className="size-10 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: `${color}1a` }}>
                  {(() => { const Icon = industryIcon(detail.industry, detail.industryLabel); return <Icon className="size-5" style={{ color }} />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{detail.name}</h2>
                    {detail.isDefault && (
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: `${BRAND.blue}14`, color: BRAND.blue }}
                      >
                        Default
                      </span>
                    )}
                  </div>
                  {detail.description && <p className="text-sm text-muted-foreground mt-0.5">{detail.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {detail.industryLabel} · {detail.serviceCategoryLabel} · {detail.questionCount} questions
                  </p>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {detail.questions.map((q) => {
                  const dim = DIMENSION_STYLE[q.scoringDimension] ?? DIMENSION_STYLE.none;
                  return (
                    <div
                      key={q.id}
                      className="rounded-lg border border-border/70 bg-muted/20 p-3.5"
                      style={{ borderLeftWidth: 3, borderLeftColor: dim.color }}
                    >
                      <p className="text-sm">
                        <span className="text-muted-foreground mr-1.5">{q.order + 1}.</span>
                        {q.text}
                        {q.isRequired && <span className="text-destructive ml-1">*</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <DimensionBadge dimension={q.scoringDimension} />
                        <span className="text-[11px] text-muted-foreground">{q.questionType.replace("_", " ")}</span>
                      </div>
                      {(q.dependsOnQuestion != null || q.excludesSelectedFrom != null) && (
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          {q.dependsOnQuestion != null && `Shown if Q${detail.questions.findIndex((x) => x.id === q.dependsOnQuestion) + 1} ≥ ${q.showIfMinValue}`}
                          {q.excludesSelectedFrom != null && ` · Excludes picks from Q${detail.questions.findIndex((x) => x.id === q.excludesSelectedFrom) + 1}`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── card grid — Generic (the default template) separated from the
  // industry-specific building blocks, each template card center-aligned.
  const generic = templates.filter((t) => t.isDefault);
  const industryTemplates = templates.filter((t) => !t.isDefault);

  return (
    <div className="space-y-8">
      {generic.length > 0 && (
        <div>
          <SectionLabel color={BRAND.blue} icon={Star}>Generic</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {generic.map((t) => (
              <TemplateCard key={t.id} template={t} color={BRAND.blue} onClick={() => setSelectedId(t.id)} />
            ))}
          </div>
        </div>
      )}

      {industryTemplates.length > 0 && (
        <div>
          <SectionLabel color={BRAND.purple} icon={Building2}>Industry templates</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {industryTemplates.map((t, i) => (
              <TemplateCard key={t.id} template={t} color={RAINBOW[(i + 1) % RAINBOW.length]} onClick={() => setSelectedId(t.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template: t, color, onClick }: { template: SurveyTemplateSummary; color: string; onClick: () => void }) {
  const Icon = industryIcon(t.industry, t.industryLabel);
  return (
    <button
      onClick={onClick}
      className="text-center rounded-xl border border-border bg-card p-5 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all"
    >
      <div className="relative flex flex-col items-center">
        {t.isDefault && (
          <Star className="size-4 absolute top-0 right-0" style={{ color: BRAND.orange, fill: BRAND.orange }} />
        )}
        <div className="size-11 rounded-full grid place-items-center" style={{ backgroundColor: `${color}1a` }}>
          <Icon className="size-5" style={{ color }} />
        </div>
        <span className="font-medium text-sm mt-2.5">{t.name}</span>
      </div>

      <div className="mt-2.5 flex flex-col items-center gap-1">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ backgroundColor: `${color}14`, color }}
        >
          {t.industryLabel}
        </span>
        <span className="text-[11px] text-muted-foreground">{t.serviceCategoryLabel}</span>
      </div>

      <div className="mt-3.5 pt-3.5 border-t border-border/60 flex items-center justify-center gap-6">
        <div>
          <p className="text-sm font-semibold" style={{ color }}>{t.questionCount}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Questions</p>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: t.isActive ? BRAND.teal : "#8a8f98" }}>
            {t.isActive ? "Active" : "Inactive"}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</p>
        </div>
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Prepare Survey tab — questions (always-visible default block, growing
// as a company is picked) on the left; company picker + send-to on the
// right.
// ══════════════════════════════════════════════════════════════════════

function PrepareSurveyTab({ preselectCode }: { preselectCode?: string }) {
  const { data: companies = [], isLoading: companiesLoading } = useCompaniesWithSubs();
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithSubs | null>(null);
  const [draft, setDraft] = useState<SurveyTemplateDetail | null>(null);

  // Same favorited companies the customers view star toggle controls —
  // that list is id-based, so resolve it against the customers list to get
  // the codeCompany strings this page actually keys on.
  const { data: allCustomers = [] } = useCustomersList();
  const [favoriteIds] = useState<number[]>(() => readFavoriteCustomerIds());
  const favoriteCodes = useMemo(() => {
    const idSet = new Set(favoriteIds);
    return allCustomers.filter((c) => idSet.has(c.id)).map((c) => c.codeCompany);
  }, [allCustomers, favoriteIds]);

  const prepare = usePrepareSurvey();
  const prepareAi = usePrepareAiQuestions();

  // The always-visible base deck — the default template's own questions,
  // shown as a live preview before any company is picked, and as the
  // "Default" section of the assembled draft afterwards.
  const { data: templates = [] } = useSurveyTemplates();
  const defaultTemplate = useMemo(() => templates.find((t) => t.isDefault) ?? null, [templates]);
  const { data: defaultDetail, isLoading: defaultLoading } = useSurveyTemplate(defaultTemplate?.id ?? null);

  const selectCompany = (c: CompanyWithSubs) => {
    setSelectedCompany(c);
    setDraft(null);
    prepare.mutate(
      { codeCompany: c.codeCompany },
      { onSuccess: (data) => setDraft(data) },
    );
  };

  // Auto-select the company passed in via ?company=<code> once the
  // subscribable-companies list has loaded. Only fires once — if the user
  // then manually picks a different company, selectedCompany is no longer
  // null, so this won't fight them on subsequent re-renders.
  useEffect(() => {
    if (!preselectCode || selectedCompany || companies.length === 0) return;
    const match = companies.find((c) => c.codeCompany === preselectCode);
    if (match) selectCompany(match);
  }, [preselectCode, companies, selectedCompany]);

  const regenerateBase = () => {
    if (!selectedCompany) return;
    if (!confirm("Regenerate the base questions? This discards any edits made to the default/industry questions on this draft (AI questions are untouched).")) return;
    prepare.mutate(
      { codeCompany: selectedCompany.codeCompany, regenerate: true },
      { onSuccess: (data) => setDraft(data) },
    );
  };

  const runAiQuestions = () => {
    if (!selectedCompany) return;
    prepareAi.mutate(selectedCompany.codeCompany, { onSuccess: (data) => setDraft(data) });
  };

  // Continuous numbering across the whole draft (default → industry → AI)
  // instead of each section restarting at 1.
  const defaultQs = draft?.questions.filter((q) => q.origin === "default" || q.origin === "manual") ?? [];
  const industryQs = draft?.questions.filter((q) => q.origin === "industry") ?? [];
  const aiQs = draft?.questions.filter((q) => q.origin === "ai_generated") ?? [];

  return (
    <div className="space-y-6">
      {/* Both columns start even — the company picker sits at the top of
          the left column, directly above the title, instead of a shared
          full-width header. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <DefaultQuestionsColumn
            selectedCompany={selectedCompany}
            draft={draft}
            defaultQs={defaultQs}
            defaultDetail={defaultDetail}
            defaultLoading={defaultLoading}
            preparePending={prepare.isPending}
            onDraftChange={setDraft}
            companies={companies}
            companiesLoading={companiesLoading}
            onSelectCompany={selectCompany}
            favoriteCodes={favoriteCodes}
            onRegenerateBase={regenerateBase}
          />
        </div>
        <div className="space-y-6">
          <IndustryAiColumn
            selectedCompany={selectedCompany}
            draft={draft}
            industryQs={industryQs}
            aiQs={aiQs}
            startIndex={defaultQs.length}
            preparePending={prepare.isPending}
            onDraftChange={setDraft}
            onRunAiQuestions={runAiQuestions}
            aiPending={prepareAi.isPending}
          />
        </div>
      </div>
    </div>
  );
}

// ── company combobox — subscribed companies, favorites grouped first,
// with an industry filter alongside it ──────────────────────────────────

function CompanyCombobox({
  companies, isLoading, selected, onSelect, favoriteCodes,
}: {
  companies: CompanyWithSubs[];
  isLoading: boolean;
  selected: CompanyWithSubs | null;
  onSelect: (c: CompanyWithSubs) => void;
  favoriteCodes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [industryFilter, setIndustryFilter] = useState("all");

  const industries = useMemo(
    () => Array.from(new Set(companies.map((c) => c.dwIndustry).filter((v): v is string => !!v))).sort(),
    [companies],
  );

  const filteredCompanies = useMemo(
    () => (industryFilter === "all" ? companies : companies.filter((c) => c.dwIndustry === industryFilter)),
    [companies, industryFilter],
  );

  const favSet = useMemo(() => new Set(favoriteCodes), [favoriteCodes]);
  const favCompanies = useMemo(() => filteredCompanies.filter((c) => favSet.has(c.codeCompany)), [filteredCompanies, favSet]);
  const restCompanies = useMemo(() => filteredCompanies.filter((c) => !favSet.has(c.codeCompany)), [filteredCompanies, favSet]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left hover:border-primary/50 hover:shadow-sm transition-all"
            style={selected ? { borderColor: `${BRAND.blue}55` } : undefined}
          >
            <div className="size-8 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${BRAND.blue}1a` }}>
              <Building2 className="size-4" style={{ color: BRAND.blue }} />
            </div>
            <div className="min-w-0 flex-1">
              {selected ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold truncate">{selected.companyName}</span>
                  {selected.dwIndustry && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: `${BRAND.blue}14`, color: BRAND.blue }}
                    >
                      {selected.dwIndustry}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Search subscribed companies…</span>
              )}
            </div>
            <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <div className="flex items-center gap-2 px-2 border-b border-border">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <CommandInput placeholder="Search subscribed companies…" className="border-0 focus:ring-0" />
            </div>
            <CommandList className="max-h-[320px]">
              {isLoading && <div className="py-6 text-center text-xs text-muted-foreground">Loading clients…</div>}
              <CommandEmpty>No subscribed companies found.</CommandEmpty>
              {favCompanies.length > 0 && (
                <CommandGroup heading="Favorites">
                  {favCompanies.map((c) => (
                    <CompanyItem
                      key={c.codeCompany}
                      company={c}
                      isSelected={selected?.codeCompany === c.codeCompany}
                      isFavorite
                      onSelect={() => { onSelect(c); setOpen(false); }}
                    />
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Subscribed companies">
                {restCompanies.map((c) => (
                  <CompanyItem
                    key={c.codeCompany}
                    company={c}
                    isSelected={selected?.codeCompany === c.codeCompany}
                    isFavorite={false}
                    onSelect={() => { onSelect(c); setOpen(false); }}
                  />
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {industries.length > 0 && (
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="w-full rounded-xl">
            <div className="flex items-center gap-2">
              <Filter className="size-3.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Filter by industry" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {industries.map((ind) => (
              <SelectItem key={ind} value={ind}>{ind}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function CompanyItem({
  company, isSelected, isFavorite, onSelect,
}: {
  company: CompanyWithSubs; isSelected: boolean; isFavorite: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={company.companyName} onSelect={onSelect} className="flex items-center gap-2 cursor-pointer">
      <Building2 className="size-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{company.companyName}</p>
        {company.dwIndustry && <p className="text-[11px] text-muted-foreground truncate">{company.dwIndustry}</p>}
      </div>
      {isFavorite && <Star className="size-3.5 shrink-0" style={{ color: BRAND.orange, fill: BRAND.orange }} />}
      {isSelected && <Check className="size-3.5 shrink-0" style={{ color: BRAND.blue }} />}
    </CommandItem>
  );
}

// ── left column — default questions, always visible ─────────────────────

function DefaultQuestionsColumn({
  selectedCompany, draft, defaultQs, defaultDetail, defaultLoading, preparePending, onDraftChange,
  companies, companiesLoading, onSelectCompany, favoriteCodes, onRegenerateBase,
}: {
  selectedCompany: CompanyWithSubs | null;
  draft: SurveyTemplateDetail | null;
  defaultQs: SurveyQuestion[];
  defaultDetail: SurveyTemplateDetail | undefined;
  defaultLoading: boolean;
  preparePending: boolean;
  onDraftChange: (d: SurveyTemplateDetail) => void;
  companies: CompanyWithSubs[];
  companiesLoading: boolean;
  onSelectCompany: (c: CompanyWithSubs) => void;
  favoriteCodes: string[];
  onRegenerateBase: () => void;
}) {
  // Company picker sits at the very top of this column, above the title —
  // always visible, so both columns start even. Label + Regenerate share a
  // thin top line; the combobox gets its own full-width line so it never
  // gets squeezed.
  const selectorBar = (
    <div
      className="rounded-xl border border-border p-3.5 space-y-2.5"
      style={{ background: selectedCompany ? `linear-gradient(135deg, ${BRAND.blue}0d, transparent)` : undefined }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client company</p>
        {draft && (
          <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-[11px]" onClick={onRegenerateBase}>
            <RefreshCw className="size-3" /> Regenerate base
          </Button>
        )}
      </div>
      <CompanyCombobox
        companies={companies}
        isLoading={companiesLoading}
        selected={selectedCompany}
        onSelect={onSelectCompany}
        favoriteCodes={favoriteCodes}
      />
    </div>
  );

  // No company yet: selector, a generic title, then a static read-only
  // preview straight from the default template — nothing to edit until a
  // draft exists.
  if (!selectedCompany) {
    return (
      <>
        {selectorBar}
        <div>
          <h2 className="text-lg font-semibold">Prepare a survey</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pick a subscribed client above to get started.</p>
        </div>
        <div>
          <SectionLabel color={BRAND.blue} icon={ListChecks}>Default questions</SectionLabel>
          <p className="text-xs text-muted-foreground mb-1 mt-1">Ask on every survey, regardless of client.</p>
          {defaultLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              <Loader2 className="size-4 animate-spin" /> Loading default questions…
            </div>
          ) : defaultDetail ? (
            <ol className="space-y-2">
              {defaultDetail.questions.map((q, i) => (
                <ReadonlyQuestionRow key={q.id} question={q} index={i} accent={BRAND.blue} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No default template found — run the seed script on the backend.</p>
          )}
        </div>
      </>
    );
  }

  if (preparePending) {
    return (
      <>
        {selectorBar}
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
          <Loader2 className="size-4 animate-spin" /> Assembling questions for {selectedCompany.companyName}…
        </div>
      </>
    );
  }

  if (!draft) return selectorBar;

  return (
    <>
      {selectorBar}
      <div>
        <h2 className="text-lg font-semibold">{draft.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{draft.questionCount} questions · review before sending</p>
      </div>
      <div>
        <SectionLabel color={BRAND.blue} icon={ListChecks}>Default questions</SectionLabel>
        <ol className="space-y-2 mt-3">
          {defaultQs.map((q, i) => (
            <QuestionRow key={q.id} question={q} index={i} templateId={draft.id} accent={BRAND.blue} onChanged={() => onDraftChange(draft)} />
          ))}
        </ol>
      </div>
    </>
  );
}

// ── right column — industry (once picked) + AI (on demand) ─────────────

function IndustryAiColumn({
  selectedCompany, draft, industryQs, aiQs, startIndex, preparePending, onDraftChange, onRunAiQuestions, aiPending,
}: {
  selectedCompany: CompanyWithSubs | null;
  draft: SurveyTemplateDetail | null;
  industryQs: SurveyQuestion[];
  aiQs: SurveyQuestion[];
  startIndex: number;
  preparePending: boolean;
  onDraftChange: (d: SurveyTemplateDetail) => void;
  onRunAiQuestions: () => void;
  aiPending: boolean;
}) {
  if (!selectedCompany) {
    return (
      <>
        <div>
          <SectionLabel color={BRAND.purple}>Industry questions</SectionLabel>
          <div className="mt-3 rounded-xl border border-dashed border-border p-4 flex items-center gap-3 text-sm text-muted-foreground">
            <ArrowRight className="size-4 shrink-0" style={{ color: BRAND.purple }} />
            Added automatically once you select a client company above.
          </div>
        </div>
        <div>
          <SectionLabel color={BRAND.coral}>AI questions</SectionLabel>
          <div className="mt-3 rounded-xl border border-dashed border-border p-4 flex items-center gap-3 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" style={{ color: BRAND.coral }} />
            Available once a company is selected — Medianaute drafts a few tailored questions on demand.
          </div>
        </div>
      </>
    );
  }

  if (preparePending) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" /> Resolving industry for {selectedCompany.companyName}…
      </div>
    );
  }

  if (!draft) return null;

  const hasAiQuestions = aiQs.length > 0;

  return (
    <>
      <div>
        <SectionLabel color={BRAND.purple}>Industry questions</SectionLabel>
        {industryQs.length > 0 ? (
          <ol className="space-y-2 mt-3">
            {industryQs.map((q, i) => (
              <QuestionRow key={q.id} question={q} index={startIndex + i} templateId={draft.id} accent={BRAND.purple} onChanged={() => onDraftChange(draft)} />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground mt-3">No industry-specific questions were resolved for this client.</p>
        )}
      </div>

      <div>
        <SectionLabel color={BRAND.coral}>AI questions</SectionLabel>
        {hasAiQuestions ? (
          <>
            <ol className="space-y-2 mt-3">
              {aiQs.map((q, i) => (
                <QuestionRow key={q.id} question={q} index={startIndex + industryQs.length + i} templateId={draft.id} accent={BRAND.coral} onChanged={() => onDraftChange(draft)} />
              ))}
            </ol>
            <Button
              variant="outline" size="sm" className="gap-1.5 mt-3"
              onClick={onRunAiQuestions} disabled={aiPending}
              style={{ borderColor: `${BRAND.coral}55`, color: BRAND.coral }}
            >
              {aiPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Re-run AI questions
            </Button>
          </>
        ) : (
          <Button
            className="gap-1.5 mt-3 border-0"
            onClick={onRunAiQuestions} disabled={aiPending}
            style={{ background: `linear-gradient(90deg, ${BRAND.coral}, ${BRAND.orange})` }}
          >
            {aiPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Prepare AI questions
          </Button>
        )}
      </div>

      {/* Send — sits right under the AI section, as the natural next step
          after questions are finalized. */}
      <div className="rounded-xl border border-border p-4">
        <SendSection templateId={draft.id} templateName={draft.name} codeCompany={selectedCompany.codeCompany} />
      </div>
    </>
  );
}

function ReadonlyQuestionRow({ question, index, accent }: { question: SurveyQuestion; index: number; accent: string }) {
  return (
    <li className="rounded-lg border border-border/70 bg-muted/20 p-3" style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
      <p className="text-sm">
        <span className="text-muted-foreground mr-2">{index + 1}.</span>
        {question.text}
        {question.isRequired && <span className="text-destructive ml-1">*</span>}
      </p>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <DimensionBadge dimension={question.scoringDimension} />
        <span className="text-[11px] text-muted-foreground">{question.questionType.replace("_", " ")}</span>
      </div>
    </li>
  );
}

function QuestionRow({
  question, index, templateId, onChanged, accent,
}: {
  question: SurveyQuestion; index: number; templateId: number; onChanged: () => void; accent: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.text);
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();

  const save = () => {
    updateQuestion.mutate(
      { questionId: question.id, templateId, payload: { text } },
      { onSuccess: () => { setEditing(false); onChanged(); } },
    );
  };

  const remove = () => {
    if (!confirm("Remove this question from the draft?")) return;
    deleteQuestion.mutate({ questionId: question.id, templateId }, { onSuccess: onChanged });
  };

  return (
    <li className="rounded-lg border border-border/70 bg-muted/20 p-3" style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} className="h-8 text-sm" />
              <Button size="icon" className="size-8 shrink-0" onClick={save} disabled={updateQuestion.isPending}>
                {updateQuestion.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              </Button>
              <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={() => { setText(question.text); setEditing(false); }}>
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <p className="text-sm">
              <span className="text-muted-foreground mr-2">{index + 1}.</span>
              {question.text}
              {question.isRequired && <span className="text-destructive ml-1">*</span>}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <OriginBadge origin={question.origin} />
            <DimensionBadge dimension={question.scoringDimension} />
            <span className="text-[11px] text-muted-foreground">{question.questionType.replace("_", " ")}</span>
            {question.dependsOnQuestion != null && (
              <span className="text-[11px] text-muted-foreground italic">conditional</span>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" onClick={remove}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

// ── send-to-contact — moved into the right rail, next to the company ───

function SendSection({ templateId, templateName, codeCompany }: { templateId: number; templateName: string; codeCompany: string }) {
  const { data: contacts = [], isLoading } = useClientContacts(codeCompany);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const createContact = useCreateContact(codeCompany);
  const sendSurvey = useSendSurvey(codeCompany);

  const addContact = () => {
    if (!fullName.trim() || !email.trim()) return;
    createContact.mutate(
      { code_company: codeCompany, full_name: fullName.trim(), email: email.trim() },
      {
        onSuccess: (c) => {
          setSelectedContactId(c.id);
          setAdding(false);
          setFullName("");
          setEmail("");
        },
      },
    );
  };

  const send = () => {
    if (!selectedContactId) return;
    sendSurvey.mutate({ template_id: templateId, contact_id: selectedContactId });
  };

  return (
    <div className="space-y-3 pt-2">
      <SectionLabel color={BRAND.teal} icon={Send}>Send to</SectionLabel>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading contacts…</p>
      ) : contacts.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">No contacts yet for this client.</p>
      ) : (
        <div className="space-y-1.5">
          {contacts.map((c: ClientContact) => (
            <label
              key={c.id}
              className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-border/70 p-2.5 hover:bg-muted/40 transition-colors"
              style={selectedContactId === c.id ? { borderColor: `${BRAND.teal}66`, backgroundColor: `${BRAND.teal}0d` } : undefined}
            >
              <input
                type="radio" name="send-contact" checked={selectedContactId === c.id}
                onChange={() => setSelectedContactId(c.id)}
                style={{ accentColor: BRAND.teal }}
              />
              <span className="truncate">{c.fullName}</span>
              <span className="text-muted-foreground truncate">· {c.email}</span>
            </label>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-8 text-sm" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-8 text-sm" />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-8 flex-1" onClick={addContact} disabled={createContact.isPending}>
              {createContact.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
            </Button>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setAdding(false)}><X className="size-3.5" /></Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setAdding(true)}>
          <UserPlus className="size-3.5" /> Add contact
        </Button>
      )}

      <Button
        className="w-full gap-1.5 mt-2 border-0"
        onClick={send} disabled={!selectedContactId || sendSurvey.isPending}
        style={{ background: `linear-gradient(90deg, ${BRAND.teal}, ${BRAND.blue})` }}
      >
        {sendSurvey.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Send survey
      </Button>

      <Link
        to="/surveys/contacts"
        search={{ company: codeCompany }}
        className="flex items-center justify-center gap-1.5 text-xs font-medium hover:underline pt-1"
        style={{ color: BRAND.blue }}
      >
        <MessageSquareText className="size-3.5" /> View this client's feedback
      </Link>
    </div>
  );
}