import { Sparkles, Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAiAssistant } from "@/hooks/use-ai-assistant";
import { AiChatView } from "./AiChatView";

/**
 * The quick-access popup (opened from the TopBar's "Ask AI" button or the
 * sidebar). Conversation state lives in AiAssistantProvider, so it stays in
 * sync with the docked panel (AiDock) and the full /ai page.
 *
 * This component only renders while unpinned — AppShell swaps to AiDock the
 * moment the panel is pinned, so clicking Pin here docks it into the layout
 * instead of floating.
 */
export function AIPanel() {
  const { t } = useTranslation();
  const { open, togglePin, closeAssistant } = useAiAssistant();

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) closeAssistant();
      }}
    >
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

            {/* Extra right margin clears the Sheet's own built-in close (X) button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePin}
              className="size-7 mr-8"
              aria-label="Pin — dock to the side of the page"
              title="Pin"
            >
              <Pin className="size-3.5" />
            </Button>
          </div>
        </SheetHeader>

        <AiChatView />
      </SheetContent>
    </Sheet>
  );
}