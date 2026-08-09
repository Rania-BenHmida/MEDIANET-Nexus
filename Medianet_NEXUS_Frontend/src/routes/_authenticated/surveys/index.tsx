// surveys/index.tsx — route: /_authenticated/surveys
// First testable surface for the survey agent: browse seeded templates,
// inspect their questions (with scoring-dimension tags), and smoke-test
// client contact creation against a real company picked by name. Not the
// final UI — just enough to verify the backend end to end before building
// the actual send flow.

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useSurveyTemplates, useSurveyTemplate, useClientContacts, useCreateContact, useSendSurvey } from "@/hooks/use-surveys";
import { useCustomersList } from "@/hooks/use-customers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, ClipboardList, Star, Heart, TrendingUp, Circle, Search, Building2, X, Send } from "lucide-react";

const DIMENSION_STYLE: Record<string, { label: string; tone: string; icon: typeof Star }> = {
  satisfaction:     { label: "Satisfaction", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20", icon: Star },
  loyalty:          { label: "Loyalty",      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: Heart },
  upsell_readiness: { label: "Upsell",       tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20", icon: TrendingUp },
  none:             { label: "Context only", tone: "bg-muted text-muted-foreground border-border", icon: Circle },
};

function DimensionBadge({ dimension }: { dimension: string }) {
  const meta = DIMENSION_STYLE[dimension] ?? DIMENSION_STYLE.none;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.tone}`}>
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/surveys/")({
  component: SurveysPage,
});

function SurveysPage() {
  const { roles } = useAuth();
  if (!canAccess("surveys", roles)) return <Navigate to="/unauthorized" />;

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: templates = [], isLoading, isError, refetch } = useSurveyTemplates();
  const activeId = selectedId ?? templates[0]?.id ?? null;
  const { data: detail, isLoading: detailLoading } = useSurveyTemplate(activeId);

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Customer Success"
        title="Survey Templates"
        description="Industry- and service-specific question sets used to generate satisfaction surveys."
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading templates…
        </div>
      )}

      {isError && (
        <div className="text-sm text-destructive py-12 text-center">
          Couldn't reach the surveys API. Is the Django server running?
          <Button variant="outline" size="sm" className="ml-3" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !isError && templates.length === 0 && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground py-16">
          <Inbox className="size-8" />
          <p className="text-sm">No templates yet — run <code className="text-xs bg-muted px-1.5 py-0.5 rounded">python manage.py seed_surveys</code> on the backend.</p>
        </div>
      )}

      {!isLoading && !isError && templates.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Template list */}
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  t.id === activeId
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{t.name}</span>
                  {t.isDefault && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Default</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.industryLabel} · {t.serviceCategoryLabel} · {t.questionCount} questions
                </p>
              </button>
            ))}
          </div>

          {/* Template detail */}
          <div className="rounded-lg border border-border p-6">
            {detailLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading questions…
              </div>
            )}
            {detail && !detailLoading && (
              <>
                <div className="flex items-start gap-3 mb-1">
                  <ClipboardList className="size-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h2 className="text-lg font-semibold">{detail.name}</h2>
                    {detail.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{detail.description}</p>
                    )}
                  </div>
                </div>
                <ol className="mt-6 space-y-4">
                  {detail.questions.map((q) => (
                    <li key={q.id} className="border-b border-border/60 pb-4 last:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm">
                          <span className="text-muted-foreground mr-2">{q.order + 1}.</span>
                          {q.text}
                          {q.isRequired && <span className="text-destructive ml-1">*</span>}
                        </p>
                        <DimensionBadge dimension={q.scoringDimension} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-5">
                        {q.questionType.replace("_", " ")}
                        {q.scoringDimension !== "none" && ` · weight ${q.weight}`}
                      </p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      )}

      {/* Contacts + send test — pick a real company by name instead of typing a code */}
      <div className="mt-10 rounded-lg border border-border p-6 max-w-xl">
        <h3 className="text-sm font-semibold mb-1">Send a survey</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Uses the template selected above{detail ? ` (“${detail.name}”)` : ""}.
        </p>
        <CompanyPicker templateId={activeId} templateName={detail?.name ?? null} />
      </div>
    </div>
  );
}

function CompanyPicker({ templateId, templateName }: { templateId: number | null; templateName: string | null }) {
  const { data: customers = [], isLoading } = useCustomersList();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ codeCompany: string; company: string } | null>(null);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return customers.filter((c) => c.company.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, query]);

  if (selected) {
    return (
      <div>
        <div className="flex items-center gap-2 text-sm mb-4">
          <Building2 className="size-4 text-muted-foreground" />
          <span className="font-medium">{selected.company}</span>
          <button
            onClick={() => { setSelected(null); setQuery(""); }}
            className="text-muted-foreground hover:text-foreground ml-1"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <ContactsPanel codeCompany={selected.codeCompany} templateId={templateId} templateName={templateName} />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={isLoading ? "Loading companies…" : "Search company name…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading}
          className="pl-8 max-w-sm"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1 max-w-sm rounded-md border border-border bg-popover shadow-sm overflow-hidden">
          {matches.map((c) => (
            <button
              key={c.codeCompany}
              onClick={() => setSelected({ codeCompany: c.codeCompany, company: c.company })}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center gap-2"
            >
              <Building2 className="size-3.5 text-muted-foreground shrink-0" />
              <span>{c.company}</span>
              {c.industry && <span className="text-xs text-muted-foreground ml-auto">{c.industry}</span>}
            </button>
          ))}
        </div>
      )}
      {query.trim() && matches.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground mt-2">No company matches "{query}".</p>
      )}
    </div>
  );
}

function ContactsPanel({
  codeCompany,
  templateId,
  templateName,
}: {
  codeCompany: string;
  templateId: number | null;
  templateName: string | null;
}) {
  const { data: contacts = [], isLoading } = useClientContacts(codeCompany);
  const createContact = useCreateContact(codeCompany);
  const sendSurvey = useSendSurvey(codeCompany);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [justSentTo, setJustSentTo] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No contacts for this company yet — add one below first.</p>
      ) : (
        <ul className="text-sm space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="font-medium">{c.fullName}</span>
              <span className="text-muted-foreground">{c.email}</span>
              {c.isPrimary && <span className="text-[10px] uppercase text-primary font-semibold">Primary</span>}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 px-2 text-xs"
                disabled={!templateId || sendSurvey.isPending}
                onClick={() => {
                  if (!templateId) return;
                  setJustSentTo(c.id);
                  sendSurvey.mutate(
                    { template_id: templateId, contact_id: c.id },
                    { onError: () => setJustSentTo(null) }
                  );
                }}
              >
                <Send className="size-3 mr-1" />
                {sendSurvey.isPending && justSentTo === c.id ? "Sending…" : "Send survey"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!templateId && (
        <p className="text-xs text-amber-600 dark:text-amber-500">Pick a template above before sending.</p>
      )}
      {sendSurvey.isSuccess && justSentTo && (
        <p className="text-xs text-emerald-600 dark:text-emerald-500">
          "{templateName}" sent — link expires {new Date(sendSurvey.data.expiresAt!).toLocaleDateString()}.
        </p>
      )}
      {sendSurvey.isError && (
        <p className="text-xs text-destructive">
          {(sendSurvey.error as Error)?.message ?? "Couldn't send the survey."}
        </p>
      )}

      <div className="flex gap-2 pt-2 border-t border-border/60">
        <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[160px]" />
        <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-[200px]" />
        <Button
          size="sm"
          disabled={!name || !email || createContact.isPending}
          onClick={() => {
            createContact.mutate(
              { code_company: codeCompany, full_name: name, email },
              { onSuccess: () => { setName(""); setEmail(""); } }
            );
          }}
        >
          {createContact.isPending ? "Adding…" : "Add contact"}
        </Button>
      </div>
    </div>
  );
}