import { Sparkles, PinOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAiAssistant } from "@/hooks/use-ai-assistant";
import { AiChatView } from "./AiChatView";

/**
 * Docked (pinned) variant of the assistant. Unlike AIPanel — which floats
 * over the page as an overlay — this renders as a real column in AppShell's
 * flex row, so the sidebar and main content sit beside it instead of being
 * covered by it. Conversation state is the same context as AIPanel and the
 * full /ai page, so switching between docked/floating/full-page never loses
 * the thread.
 */
export function AiDock() {
  const { t } = useTranslation();
  const { togglePin, closeAssistant } = useAiAssistant();

  return (
    <aside className="sticky top-0 h-screen w-[26rem] shrink-0 border-l border-border bg-background flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold">
          <div className="size-7 rounded-md bg-primary/10 grid place-items-center">
            <Sparkles className="size-3.5 text-primary" />
          </div>
          {t("ai.title")}
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
            BETA
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={togglePin}
            aria-label="Unpin — go back to a floating panel"
            title="Unpin"
          >
            <PinOff className="size-3.5 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={closeAssistant}
            aria-label="Close"
            title="Close"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <AiChatView />
    </aside>
  );
}