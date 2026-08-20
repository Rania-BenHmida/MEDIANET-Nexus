import { PinOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAiAssistant } from "@/hooks/use-ai-assistant";
import { AiChatView } from "./AiChatView";
import medianauteAvatar from "@/assets/robot-avatar-static.png";

const BRAND = { blue: "#2E5FD9", purple: "#8C5AC8" };

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
  const { togglePin, closeAssistant, dockWidth, startDockResize } = useAiAssistant();

  return (
    <aside
      style={{ width: dockWidth }}
      className="sticky top-0 h-screen shrink-0 border-l border-border bg-background flex flex-col relative"
    >
      {/* Drag handle — grab anywhere on this thin strip to resize; width persists across reloads */}
      <div
        onPointerDown={startDockResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
      />
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-base font-semibold">
          <img
            src={medianauteAvatar}
            alt=""
            aria-hidden
            className="size-8 rounded-full object-cover shadow-sm"
            style={{ backgroundColor: BRAND.blue }}
          />
          {t("ai.title")}
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded text-white"
            style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
          >
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
            <PinOff className="size-3.5" style={{ color: BRAND.blue }} />
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