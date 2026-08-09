// survey.$token.tsx — route: /survey/$token
// The page a CLIENT sees after clicking the emailed link. No login, no
// sidebar, no NEXUS branding chrome beyond a simple header — this is
// external-facing. Renders whatever question types the resolved
// template happened to use, submits once, then shows a thank-you state.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePublicSurvey, useSubmitPublicSurvey } from "@/hooks/use-surveys";
import type { PublicSurveyQuestion, SurveyAnswer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Star } from "lucide-react";

export const Route = createFileRoute("/survey/$token")({
  component: PublicSurveyPage,
});

function PublicSurveyPage() {
  const { token } = Route.useParams();
  const { data, isLoading, isError } = usePublicSurvey(token);
  const submit = useSubmitPublicSurvey(token);
  const [answers, setAnswers] = useState<Record<number, string | number | string[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setAnswer = (questionId: number, value: string | number | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    setSubmitError(null);
    const payload: SurveyAnswer[] = Object.entries(answers).map(([qid, value]) => ({
      question_id: Number(qid),
      value,
    }));
    submit.mutate(payload, {
      onError: (err) => setSubmitError((err as Error)?.message ?? "Something went wrong submitting your answers."),
    });
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-xl bg-background border border-border rounded-xl shadow-sm p-8">
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">MEDIANET</p>
          <h1 className="text-xl font-semibold">
            {isLoading ? "Loading…" : data?.templateName ?? "Survey"}
          </h1>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 text-center py-8">
            <AlertTriangle className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">This survey link isn't valid. Please check the link and try again.</p>
          </div>
        )}

        {data?.alreadyCompleted && (
          <div className="flex flex-col items-center gap-2 text-center py-8">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <p className="text-sm font-medium">You've already submitted this survey.</p>
            <p className="text-xs text-muted-foreground">Thank you — no further action needed.</p>
          </div>
        )}

        {data?.expired && (
          <div className="flex flex-col items-center gap-2 text-center py-8">
            <AlertTriangle className="size-6 text-amber-500" />
            <p className="text-sm font-medium">This survey link has expired.</p>
            <p className="text-xs text-muted-foreground">Please reach out to your MEDIANET contact for a new one.</p>
          </div>
        )}

        {submit.isSuccess && (
          <div className="flex flex-col items-center gap-2 text-center py-8">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <p className="text-sm font-medium">Thanks for your feedback!</p>
            <p className="text-xs text-muted-foreground">Your answers have been recorded.</p>
          </div>
        )}

        {data?.questions && !submit.isSuccess && (
          <div className="space-y-6">
            {data.questions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                value={answers[q.id]}
                onChange={(v) => setAnswer(q.id, v)}
              />
            ))}

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <Button className="w-full" disabled={submit.isPending} onClick={handleSubmit}>
              {submit.isPending ? "Submitting…" : "Submit"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: PublicSurveyQuestion;
  value: string | number | string[] | undefined;
  onChange: (value: string | number | string[]) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-2">
        {question.text}
        {question.isRequired && <span className="text-destructive ml-1">*</span>}
      </label>

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
                className={`size-6 ${
                  typeof value === "number" && value >= n
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground"
                }`}
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
              className={`size-8 rounded-md border text-xs font-medium transition-colors ${
                value === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {question.questionType === "multiple_choice" && (
        <div className="space-y-1.5">
          {(question.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`q_${question.id}`}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="accent-primary"
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {question.questionType === "yes_no" && (
        <div className="flex gap-2">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-4 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                value === opt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.questionType === "open_text" && (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          placeholder="Your answer…"
        />
      )}
    </div>
  );
}