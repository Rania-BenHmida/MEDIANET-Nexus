// components/CustomerVoice.tsx
// Embedded in the fiche client ($companyId.tsx) — replaces the old
// "Voice of the customer" ComingSoon placeholder. Three pieces:
//   1. Contacts — view/add/edit client contacts for this company
//   2. Sent surveys — status list, each expandable to "Get results"
//   3. AI verdict — per-survey, run/re-run + reveal the stored verdict

import { useState } from "react";
import {
  Users, Send, Plus, Pencil, Check, X, Loader2, Sparkles,
  ChevronDown, ChevronUp, AlertTriangle, RefreshCw, Mail, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useClientContacts, useCreateContact, useUpdateContact,
  useCompanySurveys, useSurveyDetail, useRunSurveyVerdict,
} from "@/hooks/use-surveys";
import type {
  ClientContact, SentSurvey, SentSurveyStatus, RecommendedActionCategory,
} from "@/lib/api/surveys";

// ── shared bits ───────────────────────────────────────────────────────

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

const CATEGORY_LABEL: Record<RecommendedActionCategory, string> = {
  retention: "Retention",
  upsell:    "Upsell",
  content:   "Content / newsletter",
  outreach:  "Outreach",
  support:   "Support",
};

function StatusBadge({ status }: { status: SentSurveyStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${STATUS_TONE[status]}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// ── 1. Contacts ──────────────────────────────────────────────────────

function ContactRow({ contact, codeCompany }: { contact: ClientContact; codeCompany: string }) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(contact.fullName);
  const [email, setEmail] = useState(contact.email);
  const [roleTitle, setRoleTitle] = useState(contact.roleTitle);
  const updateContact = useUpdateContact(codeCompany);

  const save = () => {
    updateContact.mutate(
      { id: contact.id, payload: { full_name: fullName, email, role_title: roleTitle } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const cancel = () => {
    setFullName(contact.fullName);
    setEmail(contact.email);
    setRoleTitle(contact.roleTitle);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col sm:flex-row gap-2 py-2 border-b border-border last:border-0">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-8 text-sm" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-8 text-sm" />
        <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Role" className="h-8 text-sm" />
        <div className="flex gap-1 shrink-0">
          <Button size="icon" className="size-8" onClick={save} disabled={updateContact.isPending}>
            {updateContact.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          </Button>
          <Button size="icon" variant="outline" className="size-8" onClick={cancel}><X className="size-3.5" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 group">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{contact.fullName}</p>
          {contact.isPrimary && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <Star className="size-3 fill-current" /> Primary
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {contact.email}{contact.roleTitle ? ` · ${contact.roleTitle}` : ""}
        </p>
      </div>
      <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => setEditing(true)}>
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}

function AddContactRow({ codeCompany, onDone }: { codeCompany: string; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const createContact = useCreateContact(codeCompany);

  const submit = () => {
    if (!fullName.trim() || !email.trim()) return;
    createContact.mutate(
      { code_company: codeCompany, full_name: fullName.trim(), email: email.trim(), role_title: roleTitle.trim() },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 pt-3">
      <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-8 text-sm" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-8 text-sm" />
      <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Role (optional)" className="h-8 text-sm" />
      <div className="flex gap-1 shrink-0">
        <Button size="sm" className="h-8" onClick={submit} disabled={createContact.isPending || !fullName.trim() || !email.trim()}>
          {createContact.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
        </Button>
        <Button size="icon" variant="outline" className="h-8" onClick={onDone}><X className="size-3.5" /></Button>
      </div>
    </div>
  );
}

function ContactsCard({ codeCompany }: { codeCompany: string }) {
  const { data: contacts = [], isLoading } = useClientContacts(codeCompany);
  const [adding, setAdding] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users className="size-3.5" /> Contacts
        </p>
        {!adding && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add contact
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading contacts…</p>
      ) : contacts.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No contacts yet for this client.</p>
      ) : (
        <div>{contacts.map((c) => <ContactRow key={c.id} contact={c} codeCompany={codeCompany} />)}</div>
      )}
      {adding && <AddContactRow codeCompany={codeCompany} onDone={() => setAdding(false)} />}
    </div>
  );
}

// ── 2 & 3. Sent surveys + AI verdict ────────────────────────────────────

function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center px-3 py-1.5 rounded-lg bg-muted/50">
      <p className="text-sm font-semibold text-foreground tabular-nums">{value != null ? value.toFixed(1) : "—"}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function VerdictPanel({ survey, codeCompany }: { survey: SentSurvey; codeCompany: string }) {
  const { data: detail, isLoading } = useSurveyDetail(survey.id);
  const runVerdict = useRunSurveyVerdict(codeCompany);
  const verdict = detail?.verdict ?? survey.verdict;

  const launch = () => runVerdict.mutate(survey.id);

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      {isLoading && <p className="text-xs text-muted-foreground">Loading responses…</p>}

      {detail && (
        <div className="space-y-1.5">
          {detail.responses.map((r) => (
            <div key={r.questionId} className="text-xs flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{r.text}</span>
              <span className="font-medium text-foreground text-right shrink-0 max-w-[50%]">{String(r.answer)}</span>
            </div>
          ))}
        </div>
      )}

      {!verdict || verdict.status === "pending" ? (
        <Button size="sm" className="h-8 gap-1.5" onClick={launch} disabled={runVerdict.isPending}>
          {runVerdict.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Run AI verdict
        </Button>
      ) : verdict.status === "failed" ? (
        <div className="flex items-center justify-between gap-2 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2">
          <span className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" /> Scoring failed{verdict.errorMessage ? `: ${verdict.errorMessage}` : "."}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={launch} disabled={runVerdict.isPending}>
            {runVerdict.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {verdict.sentiment && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${SENTIMENT_TONE[verdict.sentiment] ?? ""}`}>
                  {verdict.sentiment}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                Run #{verdict.generationCount}{verdict.generatedAt ? ` · ${fmtDate(verdict.generatedAt)}` : ""}
              </span>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={launch} disabled={runVerdict.isPending}>
              {runVerdict.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Re-run
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <ScorePill label="Overall" value={verdict.overallScore} />
            <ScorePill label="Satisfaction" value={verdict.satisfactionScore} />
            <ScorePill label="Loyalty" value={verdict.loyaltyScore} />
            <ScorePill label="Upsell" value={verdict.upsellReadinessScore} />
          </div>

          {verdict.summary && <p className="text-xs text-foreground leading-relaxed">{verdict.summary}</p>}

          {verdict.riskFlags.length > 0 && (
            <div className="space-y-1">
              {verdict.riskFlags.map((flag, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="size-3 shrink-0" /> {flag}
                </div>
              ))}
            </div>
          )}

          {verdict.recommendedActions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recommended actions</p>
              {verdict.recommendedActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary shrink-0">
                    {CATEGORY_LABEL[a.category] ?? a.category}
                  </span>
                  <span className="text-foreground">{a.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SurveyRow({ survey, codeCompany }: { survey: SentSurvey; codeCompany: string }) {
  const [expanded, setExpanded] = useState(false);
  const canShowResults = survey.status === "completed";

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{survey.templateName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {survey.contactName ?? "—"} · sent {fmtDate(survey.sentAt)}
            {survey.completedAt ? ` · completed ${fmtDate(survey.completedAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={survey.status} />
          {canShowResults && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setExpanded((v) => !v)}>
              {survey.verdict?.status === "ready" ? "Results" : "Get results"}
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </Button>
          )}
        </div>
      </div>
      {expanded && canShowResults && <VerdictPanel survey={survey} codeCompany={codeCompany} />}
    </div>
  );
}

function SurveysCard({ codeCompany }: { codeCompany: string }) {
  const { data: surveys = [], isLoading } = useCompanySurveys(codeCompany);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
        <Send className="size-3.5" /> Sent surveys
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading surveys…</p>
      ) : surveys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Mail className="size-5 opacity-50" />
          <p className="text-xs">No surveys sent to this client yet.</p>
        </div>
      ) : (
        <div>{surveys.map((s) => <SurveyRow key={s.id} survey={s} codeCompany={codeCompany} />)}</div>
      )}
    </div>
  );
}

// ── Exported panel ───────────────────────────────────────────────────

export function CustomerVoice({ codeCompany }: { codeCompany: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ContactsCard codeCompany={codeCompany} />
      <SurveysCard codeCompany={codeCompany} />
    </div>
  );
}