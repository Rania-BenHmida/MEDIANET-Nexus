import { useEffect, useRef } from "react";
import { Send, Mic, Square, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { useAiAssistant } from "@/hooks/use-ai-assistant";
import { ChartBubble } from "@/components/ChartBubble";
import medianauteAvatar from "@/assets/robot-avatar-static.png";

// Same brand palette used across Projects/Deals/Customers/Dashboard — reused
// here so Medianaute reads as part of the same product, not a bolted-on
// generic chat widget.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};

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
            <span className="mt-[0.45rem] size-1 shrink-0 rounded-full" style={{ backgroundColor: BRAND.teal }} />
            <span className="flex-1">{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => <em className="italic opacity-80">{children}</em>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: BRAND.blue }}>
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

/** Formats a message timestamp as a short local clock time, e.g. "10:42 AM". */
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Small static avatar beside each assistant reply — a still frame of the
 * Medianaute mascot (not the animated gif; a still keeps the thread calm
 * to read instead of every reply having its own looping animation). */
function AssistantAvatar() {
  return (
    <img
      src={medianauteAvatar}
      alt=""
      aria-hidden
      className="size-7 rounded-full object-cover shrink-0 mt-0.5 shadow-sm"
      style={{ backgroundColor: BRAND.blue }}
    />
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
    retry,
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
        {messages.map((m, i) => {
          const canRetry = m.role === "assistant" && i > 0 && messages[i - 1]?.role === "user";
          return (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex items-start gap-2.5"}>
              {m.role === "assistant" && <AssistantAvatar />}
              <div className={m.role === "user" ? "max-w-[85%]" : "flex-1 min-w-0"}>
                <div
                  className={
                    m.role === "user"
                      ? "flex items-baseline justify-end gap-1.5 mb-1 px-1"
                      : "flex items-baseline gap-1.5 mb-1 px-1"
                  }
                >
                  {m.role === "user" && (
                    <span className="text-[10px] font-medium text-muted-foreground">{t("ai.you")}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/70">{formatTime(m.timestamp)}</span>
                </div>
                <div
                  className={
                    m.role === "user"
                      ? "text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm ml-auto whitespace-pre-wrap"
                      : "max-w-[90%] bg-muted/40 border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-foreground"
                  }
                  style={m.role === "user" ? { background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.purple})` } : undefined}
                >
                  {m.role === "user" ? m.content : <Markdown>{m.content}</Markdown>}
                </div>
                {m.role === "assistant" && m.chart && <ChartBubble chart={m.chart} />}
                {canRetry && (
                  <button
                    type="button"
                    onClick={() => retry(i)}
                    disabled={sending}
                    className="mt-1 ml-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    aria-label="Retry — regenerate this answer"
                    title="Retry"
                  >
                    <RotateCcw className="size-2.5" />
                    {t("ai.retry")}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {showSuggestions && (
          <div className="pt-2 pl-9 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              {t("ai.suggested")}
            </p>
            {suggestions.map((s, i) => {
              const accent = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal][i % 5];
              return (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left px-3 py-2.5 text-xs text-foreground border border-border rounded-lg hover:bg-muted/60 transition-colors"
                  style={{ borderLeftWidth: 2, borderLeftColor: accent }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
                >
                  {s}
                </button>
              );
            })}
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
            className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-md text-white grid place-items-center transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.purple})` }}
            aria-label="Send"
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}