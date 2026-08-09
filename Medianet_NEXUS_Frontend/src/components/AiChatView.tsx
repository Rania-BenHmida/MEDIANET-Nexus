import { useEffect, useRef } from "react";
import { Send, Mic, Square, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { useAiAssistant } from "@/hooks/use-ai-assistant";
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

/**
 * The actual chat UI — message thread + suggestions + composer. Shared verbatim
 * between the popup (AIPanel) and the full /ai page so both stay visually and
 * behaviorally identical, since they read/write the same conversation state.
 */
export function AiChatView() {
  const { t } = useTranslation();
  const {
    messages,
    input,
    setInput,
    sending,
    recording,
    transcribing,
    suggestions,
    showSuggestions,
    send,
    toggleMic,
  } = useAiAssistant();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message — on new turns, while a reply streams in
  // (sending), and while transcribing, so the thread always stays pinned to
  // the newest content instead of leaving the user scrolled up on it.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, transcribing]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
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

        {showSuggestions && (
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
        <div ref={bottomRef} />
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
    </div>
  );
}