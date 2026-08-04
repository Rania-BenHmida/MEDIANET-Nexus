import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Sparkles, Send, Mic, Square, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { genbiApi, type GenbiMessage, type GenbiChart } from "@/lib/api";
import { ChartBubble } from "@/components/ChartBubble";

/**
 * Renders assistant answers as light Markdown. The backend emits **bold**, "- "
 * bullets and blank-line paragraphs; without a renderer those show as literal
 * asterisks in one collapsed block. We style each element explicitly with
 * Tailwind (no typography plugin needed) so the answer reads cleanly and evenly
 * spaced. Only a small, safe subset of elements is styled — no raw HTML.
 */
function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="my-2 space-y-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 space-y-1.5 list-decimal pl-4">{children}</ol>,
        li: ({ children }) => (
          <li className="flex gap-2">
            <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-primary/60" />
            <span className="flex-1">{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => <em className="italic opacity-80">{children}</em>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

type Msg = { role: "user" | "assistant"; content: string; chart?: GenbiChart | null };

export function AIPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const firstName = profile?.displayName?.split(" ")[0];
  const greeting = firstName ? t("ai.greetingWithName", { name: firstName }) : t("ai.greeting");
  const intro = `${greeting} ${t("ai.intro")}`;
  const suggestions = [t("ai.s1"), t("ai.s2"), t("ai.s3"), t("ai.s4"), t("ai.s5")];

  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: intro }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // ── Mic / recording state ──────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;

    // Build history from the conversation so far (skip the assistant intro),
    // then append the new user turn locally.
    const history: GenbiMessage[] = messages
      .filter((m, i) => !(i === 0 && m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setSending(true);

    try {
      const data = await genbiApi.ask(q, history);
      const reply = data.error ?? data.natural_response ?? t("ai.error");
      setMessages((prev) => [...prev, { role: "assistant", content: reply, chart: data.chart }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("ai.error") }]);
    } finally {
      setSending(false);
    }
  };

  // ── Recording controls ─────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setTranscribing(true);
        try {
          const { text } = await genbiApi.transcribe(blob, "recording.webm");
          // Auto-send the transcript straight to the chatbot.
          if (text && text.trim()) {
            await send(text.trim());
          }
        } catch {
          setMessages((prev) => [...prev, { role: "assistant", content: t("ai.error") }]);
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      // Permission denied or no mic — surface a soft error in the thread.
      setMessages((prev) => [...prev, { role: "assistant", content: t("ai.micError") }]);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const toggleMic = () => (recording ? stopRecording() : startRecording());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border space-y-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <div className="size-7 rounded-md bg-primary/10 grid place-items-center">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              {t("ai.title")}
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                BETA
              </span>
            </SheetTitle>
            
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={m.role === "user" ? "" : "w-full"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm ml-auto whitespace-pre-wrap"
                      : "max-w-[90%] text-sm leading-relaxed text-foreground"
                  }
                >
                  {m.role === "user" ? m.content : <Markdown>{m.content}</Markdown>}
                </div>
                {m.role === "assistant" && m.chart && <ChartBubble chart={m.chart} />}
              </div>
            </div>
          ))}

          {messages.length === 1 && (
            <div className="pt-4 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {t("ai.suggested")}
              </p>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left px-3 py-2.5 text-xs text-foreground border border-border rounded-lg hover:bg-muted/60 hover:border-ring/30 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="relative"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={transcribing ? t("ai.transcribing") : t("ai.placeholder")}
              disabled={transcribing}
              className="w-full bg-muted/60 border border-transparent focus:border-border focus:bg-background rounded-xl pl-4 pr-20 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
            />
            {/* Mic button — sits just left of Send; UI otherwise unchanged */}
            <button
              type="button"
              onClick={toggleMic}
              disabled={transcribing || sending}
              className={
                "absolute right-11 top-1/2 -translate-y-1/2 size-7 rounded-md grid place-items-center transition-colors disabled:opacity-50 " +
                (recording
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-muted text-foreground hover:bg-muted/80")
              }
              aria-label={recording ? "Stop recording" : "Record"}
            >
              {transcribing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : recording ? (
                <Square className="size-3.5" />
              ) : (
                <Mic className="size-3.5" />
              )}
            </button>
            <button
              type="submit"
              disabled={sending || transcribing}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-md bg-primary text-primary-foreground grid place-items-center hover:bg-primary/90 transition-colors disabled:opacity-50"
              aria-label="Send"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}