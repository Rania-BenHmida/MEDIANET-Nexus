// survey.$token.tsx — route: /survey/$token
// The page a CLIENT sees after clicking the emailed link. No login, no
// sidebar, no NEXUS branding chrome beyond a simple header — this is
// external-facing. Renders whatever question types the resolved
// template happened to use, submits once, then shows a thank-you state.
//
// Paginated 4-questions-per-page instead of one long scroll — easier to
// complete on a phone, and it plays nicely with the conditional-question
// logic below since a newly-revealed dependent question just slots into
// its page in order.
//
// Conditional logic: a question with dependsOnQuestion is only shown once
// the referenced question's answer is >= showIfMinValue (e.g. the two
// upsell follow-ups only appear once the "how likely to explore additional
// services" question is rated 4 or 5 stars). A question with
// excludesSelectedFrom has its options filtered live to remove whatever
// was picked as the answer to the referenced question (e.g. "services to
// explore next" excludes whatever was checked in "services you already
// use").

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import logoUrl from "../../../data/images/logo-medianet.png";
import { usePublicSurvey, useSubmitPublicSurvey } from "@/hooks/use-surveys";
import type { PublicSurveyQuestion, SurveyAnswer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Star, ArrowLeft, ArrowRight, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/survey/$token")({
  component: PublicSurveyPage,
});

// Same brand palette as the rest of NEXUS — this page is external-facing,
// but it's still the client's first impression of the platform.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};
const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

type AnswerValue = string | number | string[];
type AnswersState = Record<number, AnswerValue>;

// A question is visible if it has no gate, or its gate question's current
// answer is a number >= showIfMinValue.
function isVisible(q: PublicSurveyQuestion, answers: AnswersState): boolean {
  if (q.dependsOnQuestion == null) return true;
  const gateValue = answers[q.dependsOnQuestion];
  if (gateValue == null || q.showIfMinValue == null) return false;
  const numeric = typeof gateValue === "number" ? gateValue : Number(gateValue);
  return !Number.isNaN(numeric) && numeric >= q.showIfMinValue;
}

// A question counts as answered if it has a non-empty value — used to
// gate the "Next" button for required questions.
function isAnswered(value: AnswerValue | undefined): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true; // numbers — 0 is a valid NPS/rating_10 answer
}

// Reorders questions so a conditional question (dependsOnQuestion) always
// renders immediately after the question it depends on — regardless of
// its raw `order` from the backend — so it lands on the same or next
// page once its gate question is answered, not something buried later on.
function reorderWithDependents(questions: PublicSurveyQuestion[]): PublicSurveyQuestion[] {
  const byParent = new Map<number, PublicSurveyQuestion[]>();
  const roots: PublicSurveyQuestion[] = [];

  for (const q of questions) {
    if (q.dependsOnQuestion != null) {
      const siblings = byParent.get(q.dependsOnQuestion) ?? [];
      siblings.push(q);
      byParent.set(q.dependsOnQuestion, siblings);
    } else {
      roots.push(q);
    }
  }

  const result: PublicSurveyQuestion[] = [];
  const visit = (q: PublicSurveyQuestion) => {
    result.push(q);
    (byParent.get(q.id) ?? []).forEach(visit);
  };
  roots.forEach(visit);
  return result;
}

// Filters out whatever was picked as the answer to `excludesSelectedFrom`
// from this question's option list.
function effectiveOptions(q: PublicSurveyQuestion, answers: AnswersState): string[] {
  const base = q.options ?? [];
  if (q.excludesSelectedFrom == null) return base;
  const excludeValue = answers[q.excludesSelectedFrom];
  const excludeSet = new Set(
    Array.isArray(excludeValue) ? excludeValue : excludeValue != null ? [String(excludeValue)] : [],
  );
  return base.filter((opt) => !excludeSet.has(opt));
}

function PublicSurveyPage() {
  const { token } = Route.useParams();
  const { data, isLoading, isError } = usePublicSurvey(token);
  const submit = useSubmitPublicSurvey(token);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [invalidIds, setInvalidIds] = useState<Set<number>>(new Set());
  const [logoFailed, setLogoFailed] = useState(false);

  const setAnswer = (questionId: number, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setInvalidIds((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  };

  const orderedQuestions = useMemo(
    () => reorderWithDependents(data?.questions ?? []),
    [data?.questions],
  );
  const visibleQuestions = useMemo(
    () => orderedQuestions.filter((q) => isVisible(q, answers)),
    [orderedQuestions, answers],
  );

  // At least 4 questions per page (the last page can have fewer).
  const PAGE_SIZE = 3;
  const pages = useMemo(() => {
    const chunks: PublicSurveyQuestion[][] = [];
    for (let i = 0; i < visibleQuestions.length; i += PAGE_SIZE) {
      chunks.push(visibleQuestions.slice(i, i + PAGE_SIZE));
    }
    return chunks;
  }, [visibleQuestions]);

  // If an earlier answer changes such that a later conditional question
  // disappears (e.g. the client goes back and lowers a rating), clamp the
  // page so it never points past the end of the now-shorter list.
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  const totalPages = pages.length;
  const currentPageQuestions = pages[page] ?? [];
  const isLastPage = page >= totalPages - 1;
  const pageOffset = page * PAGE_SIZE;
  const questionsShownSoFar = Math.min(pageOffset + currentPageQuestions.length, visibleQuestions.length);
  const progressPct = visibleQuestions.length > 0 ? (questionsShownSoFar / visibleQuestions.length) * 100 : 0;

  function unansweredRequiredIds(qs: PublicSurveyQuestion[]): Set<number> {
    const ids = new Set<number>();
    qs.forEach((q) => { if (q.isRequired && !isAnswered(answers[q.id])) ids.add(q.id); });
    return ids;
  }

  const goBack = () => {
    setInvalidIds(new Set());
    setPage((p) => Math.max(0, p - 1));
  };

  const goNext = () => {
    const invalid = unansweredRequiredIds(currentPageQuestions);
    if (invalid.size > 0) { setInvalidIds(invalid); return; }
    setInvalidIds(new Set());
    setPage((p) => Math.min(totalPages - 1, p + 1));
  };

  const handleSubmit = () => {
    const invalid = unansweredRequiredIds(currentPageQuestions);
    if (invalid.size > 0) { setInvalidIds(invalid); return; }
    setInvalidIds(new Set());
    setSubmitError(null);
    // Only submit answers for questions that were actually shown — if the
    // client rated the gate question below the threshold after answering
    // a follow-up, that follow-up's now-hidden answer shouldn't be sent.
    const visibleIds = new Set(visibleQuestions.map((q) => q.id));
    const payload: SurveyAnswer[] = Object.entries(answers)
      .filter(([qid]) => visibleIds.has(Number(qid)))
      .map(([qid, value]) => ({ question_id: Number(qid), value }));

    submit.mutate(payload, {
      onError: (err) => setSubmitError((err as Error)?.message ?? "Something went wrong submitting your answers."),
    });
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-xl bg-background border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${RAINBOW.join(", ")})` }} />

        <div className="p-8">
          <div className="mb-8 flex flex-col items-center text-center gap-3">
            {!logoFailed ? (
              <img
                src={logoUrl}
                alt="MEDIANET"
                className="h-8"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div
                className="size-11 rounded-xl grid place-items-center"
                style={{ background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.purple})` }}
              >
                <ClipboardList className="size-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold">
                {isLoading ? "Loading…" : data?.companyName ? `Client Survey for ${data.companyName}` : "Survey"}
              </h1>
              {data?.templateName && (
                <span
                  className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ backgroundColor: `${BRAND.blue}14`, color: BRAND.blue }}
                >
                  {data.templateName}
                </span>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <div className="size-12 rounded-full grid place-items-center" style={{ backgroundColor: "#8a8f9814" }}>
                <AlertTriangle className="size-6" style={{ color: "#8a8f98" }} />
              </div>
              <p className="text-sm text-muted-foreground">This survey link isn't valid. Please check the link and try again.</p>
            </div>
          )}

          {data?.alreadyCompleted && (
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <div className="size-12 rounded-full grid place-items-center" style={{ backgroundColor: `${BRAND.teal}1a` }}>
                <CheckCircle2 className="size-6" style={{ color: BRAND.teal }} />
              </div>
              <p className="text-sm font-medium">You've already submitted this survey.</p>
              <p className="text-xs text-muted-foreground">Thank you — no further action needed.</p>
            </div>
          )}

          {data?.expired && (
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <div className="size-12 rounded-full grid place-items-center" style={{ backgroundColor: `${BRAND.orange}1a` }}>
                <AlertTriangle className="size-6" style={{ color: BRAND.orange }} />
              </div>
              <p className="text-sm font-medium">This survey link has expired.</p>
              <p className="text-xs text-muted-foreground">Please reach out to your MEDIANET contact for a new one.</p>
            </div>
          )}

          {submit.isSuccess && (
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <div className="size-12 rounded-full grid place-items-center" style={{ backgroundColor: `${BRAND.teal}1a` }}>
                <CheckCircle2 className="size-6" style={{ color: BRAND.teal }} />
              </div>
              <p className="text-sm font-medium">Thanks for your feedback!</p>
              <p className="text-xs text-muted-foreground">Your answers have been recorded.</p>
            </div>
          )}

          {data?.questions && !submit.isSuccess && !isLoading && totalPages > 0 && currentPageQuestions.length > 0 && (
            <div className="space-y-7">
              {/* progress */}
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>
                    Questions {pageOffset + 1}
                    {currentPageQuestions.length > 1 ? `–${pageOffset + currentPageQuestions.length}` : ""} of {visibleQuestions.length}
                  </span>
                  <span style={{ color: RAINBOW[page % RAINBOW.length] }}>{Math.round(progressPct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
                  />
                </div>
              </div>

              <div className="space-y-7">
                {currentPageQuestions.map((q, i) => (
                  <div key={q.id}>
                    {i > 0 && <div className="h-px bg-border mb-7" />}
                    <QuestionField
                      number={pageOffset + i + 1}
                      accent={RAINBOW[(pageOffset + i) % RAINBOW.length]}
                      question={q}
                      options={effectiveOptions(q, answers)}
                      value={answers[q.id]}
                      onChange={(v) => setAnswer(q.id, v)}
                      showRequiredError={invalidIds.has(q.id)}
                    />
                  </div>
                ))}
              </div>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button variant="outline" className="gap-1.5" onClick={goBack} disabled={page === 0}>
                  <ArrowLeft className="size-3.5" /> Back
                </Button>
                {isLastPage ? (
                  <Button
                    className="gap-1.5 border-0"
                    disabled={submit.isPending}
                    onClick={handleSubmit}
                    style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
                  >
                    {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
                  </Button>
                ) : (
                  <Button
                    className="gap-1.5 border-0"
                    onClick={goNext}
                    style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
                  >
                    Next <ArrowRight className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionField({
  number, accent, question, options, value, onChange, showRequiredError,
}: {
  number: number;
  accent: string;
  question: PublicSurveyQuestion;
  options: string[];
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  showRequiredError: boolean;
}) {
  const selectedList = Array.isArray(value) ? value : [];

  const toggleMultiSelect = (opt: string) => {
    const next = selectedList.includes(opt)
      ? selectedList.filter((v) => v !== opt)
      : [...selectedList, opt];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <span
          className="size-7 rounded-full grid place-items-center text-xs font-semibold shrink-0"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          {number}
        </span>
        <label className="text-sm font-medium pt-1">
          {question.text}
          {question.isRequired && <span className="text-destructive ml-1">*</span>}
        </label>
      </div>

      <div className="pl-10">
        {question.questionType === "rating_5" && (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className="p-1"
                aria-label={`${n} out of 5`}
              >
                <Star
                  className="size-7"
                  style={typeof value === "number" && value >= n
                    ? { color: BRAND.orange, fill: BRAND.orange }
                    : { color: "#c7cad1" }}
                />
              </button>
            ))}
          </div>
        )}

        {(question.questionType === "rating_10" || question.questionType === "nps") && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className="size-9 rounded-lg border text-sm font-medium transition-colors"
                style={value === n
                  ? { borderColor: accent, backgroundColor: accent, color: "white" }
                  : { borderColor: "var(--border)" }}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {question.questionType === "multiple_choice" && (
          <div className="space-y-2">
            {options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2.5 text-sm cursor-pointer rounded-lg border p-3 transition-colors"
                style={value === opt ? { borderColor: `${accent}66`, backgroundColor: `${accent}0d` } : { borderColor: "var(--border)" }}
              >
                <input
                  type="radio"
                  name={`q_${question.id}`}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                  style={{ accentColor: accent }}
                />
                {opt}
              </label>
            ))}
          </div>
        )}

        {question.questionType === "multi_select" && (
          <div className="space-y-2">
            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No options left to choose from.</p>
            ) : (
              options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2.5 text-sm cursor-pointer rounded-lg border p-3 transition-colors"
                  style={selectedList.includes(opt) ? { borderColor: `${accent}66`, backgroundColor: `${accent}0d` } : { borderColor: "var(--border)" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedList.includes(opt)}
                    onChange={() => toggleMultiSelect(opt)}
                    style={{ accentColor: accent }}
                  />
                  {opt}
                </label>
              ))
            )}
          </div>
        )}

        {question.questionType === "yes_no" && (
          <div className="flex gap-2.5">
            {(["Yes", "No"] as const).map((opt) => {
              const optColor = opt === "Yes" ? BRAND.teal : BRAND.coral;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange(opt)}
                  className="px-5 py-2 rounded-lg border text-sm font-medium transition-colors"
                  style={value === opt
                    ? { borderColor: optColor, backgroundColor: optColor, color: "white" }
                    : { borderColor: "var(--border)" }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {question.questionType === "open_text" && (
          <textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 transition-shadow"
            style={{ boxShadow: "none" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            placeholder="Your answer…"
          />
        )}

        {showRequiredError && !isAnswered(value) && (
          <p className="text-xs text-destructive mt-2">This question is required — pick an answer to continue.</p>
        )}
      </div>
    </div>
  );
}