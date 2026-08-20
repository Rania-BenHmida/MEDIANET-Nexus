// components/CustomerVoice.tsx
// Embedded in the fiche client ($companyId.tsx) — replaces the old
// "Voice of the customer" ComingSoon placeholder. Three pieces:
//   1. Contacts — view/add/edit client contacts for this company
//   2. Sent surveys — status list, each expandable to "Get results"
//   3. AI verdict — per-survey, run/re-run + reveal the stored verdict

import { useState } from "react";
import { toast } from "sonner";
import {
  Users, Send, Plus, Pencil, Loader2, Sparkles,
  ChevronDown, ChevronUp, AlertTriangle, RefreshCw, Mail, Star, Trash2,
  Download, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useClientContacts, useCreateContact, useUpdateContact, useDeleteContact,
  useCompanySurveys, useSurveyDetail, useRunSurveyVerdict, useDeleteSurvey,
} from "@/hooks/use-surveys";
import { surveysApi } from "@/lib/api/surveys";
import type {
  ClientContact, SentSurvey, SentSurveyStatus, RecommendedActionCategory,
} from "@/lib/api/surveys";

// ── shared bits ───────────────────────────────────────────────────────

// Same brand palette as the rest of NEXUS.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};
const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

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

const CATEGORY_LABEL: Record<RecommendedActionCategory, string> = {
  retention: "Retention",
  upsell:    "Upsell",
  content:   "Content / newsletter",
  outreach:  "Outreach",
  support:   "Support",
};

function StatusBadge({ status }: { status: SentSurveyStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize"
      style={{ backgroundColor: `${color}14`, color, borderColor: `${color}33` }}
    >
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
  const [editOpen, setEditOpen] = useState(false);
  const [fullName, setFullName] = useState(contact.fullName);
  const [email, setEmail] = useState(contact.email);
  const [roleTitle, setRoleTitle] = useState(contact.roleTitle);
  const updateContact = useUpdateContact(codeCompany);
  const deleteContact = useDeleteContact(codeCompany);

  const resetFields = () => {
    setFullName(contact.fullName);
    setEmail(contact.email);
    setRoleTitle(contact.roleTitle);
  };

  const save = () => {
    updateContact.mutate(
      { id: contact.id, payload: { full_name: fullName, email, role_title: roleTitle } },
      {
        onSuccess: () => { toast.success("Contact updated", { description: fullName }); setEditOpen(false); },
        onError: (err) => toast.error("Couldn't update contact", { description: (err as Error)?.message }),
      },
    );
  };

  const remove = () => {
    if (!confirm(`Remove ${contact.fullName} from this client's contacts?`)) return;
    deleteContact.mutate(contact.id, {
      onSuccess: () => toast.success("Contact removed", { description: contact.fullName }),
      onError: (err) => toast.error("Couldn't remove contact", { description: (err as Error)?.message }),
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 group">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{contact.fullName}</p>
          {contact.isPrimary && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: BRAND.orange }}>
              <Star className="size-3 fill-current" /> Primary
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {contact.email}{contact.roleTitle ? ` · ${contact.roleTitle}` : ""}
        </p>
      </div>
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100">
        <Popover open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) resetFields(); }}>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="size-7">
              <Pencil className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <ContactForm
              fullName={fullName} setFullName={setFullName}
              email={email} setEmail={setEmail}
              roleTitle={roleTitle} setRoleTitle={setRoleTitle}
              onSubmit={save} onCancel={() => { resetFields(); setEditOpen(false); }}
              submitLabel="Save" isPending={updateContact.isPending}
            />
          </PopoverContent>
        </Popover>
        <Button
          size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive"
          onClick={remove} disabled={deleteContact.isPending}
          aria-label="Remove contact" title="Remove contact"
        >
          {deleteContact.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// Shared, properly-spaced form for both adding and editing a contact —
// stacked fields with labels instead of three squeezed inline inputs.
// It only exists on-screen briefly (inside a popover, or during an edit),
// so there's no cost to giving it room to breathe.
function ContactForm({
  fullName, setFullName, email, setEmail, roleTitle, setRoleTitle,
  onSubmit, onCancel, submitLabel, isPending,
}: {
  fullName: string; setFullName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  roleTitle: string; setRoleTitle: (v: string) => void;
  onSubmit: () => void; onCancel: () => void;
  submitLabel: string; isPending: boolean;
}) {
  const canSubmit = fullName.trim() !== "" && email.trim() !== "";
  return (
    <div className="space-y-3 w-full">
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Full name</label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Rania Ben Hmida" className="h-8 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="h-8 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Role <span className="normal-case font-normal">(optional)</span>
        </label>
        <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Marketing Director" className="h-8 text-sm" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-8" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8" onClick={onSubmit} disabled={isPending || !canSubmit}>
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function AddContactPopover({ codeCompany }: { codeCompany: string }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const createContact = useCreateContact(codeCompany);

  const reset = () => { setFullName(""); setEmail(""); setRoleTitle(""); };

  const submit = () => {
    if (!fullName.trim() || !email.trim()) return;
    createContact.mutate(
      { code_company: codeCompany, full_name: fullName.trim(), email: email.trim(), role_title: roleTitle.trim() },
      {
        onSuccess: () => {
          toast.success("Contact added", { description: fullName.trim() });
          reset();
          setOpen(false);
        },
        onError: (err) => toast.error("Couldn't add contact", { description: (err as Error)?.message }),
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
          <Plus className="size-3.5" /> Add contact
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <ContactForm
          fullName={fullName} setFullName={setFullName}
          email={email} setEmail={setEmail}
          roleTitle={roleTitle} setRoleTitle={setRoleTitle}
          onSubmit={submit} onCancel={() => { reset(); setOpen(false); }}
          submitLabel="Add" isPending={createContact.isPending}
        />
      </PopoverContent>
    </Popover>
  );
}

function ContactsCard({ codeCompany }: { codeCompany: string }) {
  const { data: contacts = [], isLoading } = useClientContacts(codeCompany);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users className="size-3.5" /> Contacts
        </p>
        <AddContactPopover codeCompany={codeCompany} />
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No contacts yet for this client.</p>
      ) : (
        <div>{contacts.map((c) => <ContactRow key={c.id} contact={c} codeCompany={codeCompany} />)}</div>
      )}
    </div>
  );
}

// ── 2 & 3. Sent surveys + AI verdict ────────────────────────────────────

function ScorePill({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="text-center px-3.5 py-2 rounded-xl" style={{ backgroundColor: `${color}14` }}>
      <p className="text-lg font-bold tabular-nums" style={{ color }}>
        {value != null ? value.toFixed(0) : "—"}
      </p>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}

function VerdictPanel({
  survey, codeCompany, standalone = false,
}: {
  survey: SentSurvey; codeCompany: string; standalone?: boolean;
}) {
  // Still fetched (not just survey.verdict) so a re-run's fresh result
  // shows immediately via cache invalidation, without needing this panel
  // to also render the raw Q&A — that lives in <SurveyResponses /> now,
  // toggled independently at the row level instead of nested in here.
  const { data: detail } = useSurveyDetail(survey.id);
  const runVerdict = useRunSurveyVerdict(codeCompany);
  const verdict = detail?.verdict ?? survey.verdict;

  const launch = () => {
    runVerdict.mutate(survey.id, {
      onSuccess: (v) => {
        if (v.status === "failed") {
          toast.error("Verdict scoring failed", { description: v.errorMessage || "See the panel for details." });
        } else if (v.reportSentAt) {
          toast.success("Verdict ready", { description: "Next-steps report emailed successfully." });
        } else {
          toast.warning("Verdict ready", { description: v.reportSendError || "Report wasn't emailed — no recipient available." });
        }
      },
      onError: (err) => toast.error("Couldn't run the AI verdict", { description: (err as Error)?.message }),
    });
  };
  const sentimentColor = verdict?.sentiment ? SENTIMENT_COLOR[verdict.sentiment] ?? BRAND.navy : BRAND.navy;

  return (
    <div className={standalone ? "space-y-3" : "mt-3 pt-3 border-t border-border space-y-3"}>
      {!verdict || verdict.status === "pending" ? (
        <Button
          size="sm" className="h-8 gap-1.5 border-0" onClick={launch} disabled={runVerdict.isPending}
          style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
        >
          {runVerdict.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Run AI verdict
        </Button>
      ) : verdict.status === "failed" ? (
        <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: `${BRAND.coral}0d`, border: `1px solid ${BRAND.coral}33` }}>
          <span className="text-xs flex items-center gap-1.5" style={{ color: BRAND.coral }}>
            <AlertTriangle className="size-3.5" /> Scoring failed{verdict.errorMessage ? `: ${verdict.errorMessage}` : "."}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={launch} disabled={runVerdict.isPending}>
            {runVerdict.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Retry
          </Button>
        </div>
      ) : (
        // The AI verdict is the whole point of this page — it gets a
        // highlighted, colored card instead of blending into the rest of
        // the panel like a footnote.
        <div
          className="rounded-xl p-4 space-y-3.5"
          style={{ background: `linear-gradient(135deg, ${sentimentColor}0f, transparent)`, border: `1px solid ${sentimentColor}33` }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="size-3.5" style={{ color: sentimentColor }} />
              {verdict.sentiment && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize"
                  style={{ backgroundColor: `${sentimentColor}14`, color: sentimentColor, borderColor: `${sentimentColor}33` }}
                >
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
            <ScorePill label="Overall" value={verdict.overallScore} color={sentimentColor} />
            <ScorePill label="Satisfaction" value={verdict.satisfactionScore} color={BRAND.teal} />
            <ScorePill label="Loyalty" value={verdict.loyaltyScore} color={BRAND.purple} />
            <ScorePill label="Upsell" value={verdict.upsellReadinessScore} color={BRAND.orange} />
          </div>

          {verdict.summary && <p className="text-xs text-foreground leading-relaxed">{verdict.summary}</p>}

          {verdict.riskFlags.length > 0 && (
            <div className="space-y-1">
              {verdict.riskFlags.map((flag, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: BRAND.coral }}>
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
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                    style={{ backgroundColor: `${BRAND.blue}14`, color: BRAND.blue }}
                  >
                    {CATEGORY_LABEL[a.category] ?? a.category}
                  </span>
                  <span className="text-foreground">{a.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Report send status + download — the PDF is regenerated on
              demand from the stored verdict, so it always matches what
              was (or would have been) emailed. Replaces the inline
              next-steps preview that used to live here — no need to show
              the text twice when the full report is one click away. */}
          <div className="pt-3 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${sentimentColor}26` }}>
            {verdict.reportSentAt ? (
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: BRAND.teal }}>
                <CheckCircle2 className="size-3.5" /> Report emailed {fmtDate(verdict.reportSentAt)}
              </span>
            ) : verdict.reportSendError ? (
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: BRAND.coral }}>
                <AlertTriangle className="size-3.5" /> Not sent — {verdict.reportSendError}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="size-3.5" /> Report not sent yet
              </span>
            )}
            <a
              href={surveysApi.reportDownloadUrl(survey.id)}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: BRAND.blue }}
            >
              <Download className="size-3.5" /> Download PDF
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── raw Q&A — lives under its own survey row now, toggled independently
// from the verdict via the row's "Results" button. ─────────────────────

function SurveyResponses({ surveyId }: { surveyId: number }) {
  const { data: detail, isLoading } = useSurveyDetail(surveyId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3 py-2">
        <Loader2 className="size-3.5 animate-spin" /> Loading responses…
      </div>
    );
  }
  if (!detail || detail.responses.length === 0) {
    return <p className="text-xs text-muted-foreground mt-3">No responses recorded.</p>;
  }

  return (
    <div className="space-y-1.5 mt-2.5 pt-2.5 border-t border-border">
      {detail.responses.map((r, i) => {
        const color = RAINBOW[i % RAINBOW.length];
        const answerText = Array.isArray(r.answer) ? r.answer.join(", ") : String(r.answer);
        return (
          <div
            key={r.questionId}
            className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5"
            style={{ borderLeftWidth: 2, borderLeftColor: color }}
          >
            <p className="text-[11px] text-muted-foreground leading-snug flex-1 min-w-0">
              <span className="font-semibold mr-1" style={{ color }}>{i + 1}.</span>
              {r.text}
            </p>
            <p className="text-xs font-medium text-foreground leading-snug text-right shrink-0 max-w-[45%]">{answerText}</p>
          </div>
        );
      })}
    </div>
  );
}

function SurveyRow({ survey, codeCompany }: { survey: SentSurvey; codeCompany: string }) {
  const [showResults, setShowResults] = useState(false);
  const [showVerdict, setShowVerdict] = useState(false);
  const canShowResults = survey.status === "completed";
  const deleteSurvey = useDeleteSurvey(codeCompany);

  const remove = () => {
    if (!confirm(`Delete this survey (${survey.templateName}, sent ${fmtDate(survey.sentAt)})? This can't be undone.`)) return;
    deleteSurvey.mutate(survey.id, {
      onSuccess: () => toast.success("Survey deleted", { description: `${survey.templateName} · ${survey.contactName ?? "—"}` }),
      onError: (err) => toast.error("Couldn't delete this survey", { description: (err as Error)?.message }),
    });
  };

  return (
    <div className="py-3 border-b border-border last:border-0 group">
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowResults((v) => !v)}>
                Results
                {showResults ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => setShowVerdict((v) => !v)}
                style={showVerdict ? { borderColor: `${BRAND.blue}55`, color: BRAND.blue } : undefined}
              >
                <Sparkles className="size-3" /> Verdict
                {showVerdict ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </Button>
            </>
          )}
          <Button
            size="icon" variant="ghost"
            className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
            onClick={remove}
            disabled={deleteSurvey.isPending}
            aria-label="Delete this survey"
            title="Delete this survey"
          >
            {deleteSurvey.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </Button>
        </div>
      </div>
      {!canShowResults && (
        <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 mt-1.5">
          <Clock className="size-3 shrink-0" />
          Unanswered — auto-deleted at the end of the quarter if it stays that way.
        </p>
      )}
      {showResults && canShowResults && <SurveyResponses surveyId={survey.id} />}
      {showVerdict && canShowResults && (
        <div className="mt-3 pt-3 border-t border-border">
          <VerdictPanel survey={survey} codeCompany={codeCompany} standalone />
        </div>
      )}
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

// ── Latest verdict — the main event, shown immediately on expand ───────
// No "Get results" click needed: this pulls the most recent completed
// survey and renders its verdict panel already open, right at the top.

function LatestVerdictSection({ codeCompany }: { codeCompany: string }) {
  const { data: surveys = [], isLoading } = useCompanySurveys(codeCompany);
  // list_surveys_for_company orders by -created_at, so the first completed
  // one is the latest response.
  const latest = surveys.find((s) => s.status === "completed");

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading latest verdict…
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="bg-card border border-dashed border-border rounded-xl p-5 flex items-center gap-3 text-sm text-muted-foreground">
        <Sparkles className="size-4 opacity-50 shrink-0" />
        No completed survey yet — the AI verdict shows here automatically once a client responds.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="size-3.5" style={{ color: BRAND.blue }} /> Latest AI verdict
        </p>
        <span className="text-[11px] text-muted-foreground">
          {latest.templateName} · completed {fmtDate(latest.completedAt)}
        </span>
      </div>
      <VerdictPanel survey={latest} codeCompany={codeCompany} standalone />
    </div>
  );
}

// ── Exported panel ───────────────────────────────────────────────────

export function CustomerVoice({ codeCompany }: { codeCompany: string }) {
  return (
    <div className="space-y-4">
      <LatestVerdictSection codeCompany={codeCompany} />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <ContactsCard codeCompany={codeCompany} />
        <SurveysCard codeCompany={codeCompany} />
      </div>
    </div>
  );
}