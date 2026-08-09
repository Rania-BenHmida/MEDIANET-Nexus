import { type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { AIPanel } from "./AIPanel";
import { AiDock } from "./AiDock";
import { AiAssistantProvider, useAiAssistant } from "@/hooks/use-ai-assistant";

function AppShellInner({ children }: { children: ReactNode }) {
  const { open, pinned, openAssistant } = useAiAssistant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The /ai/GenBI route already renders the full chat inline — skip the
  // redundant docked/floating panel while the user is on that page.
  const onAiPage = pathname === "/ai/GenBI";

  const showDock = open && pinned && !onAiPage;
  const showOverlay = open && !pinned && !onAiPage;

  return (
    <div className="h-screen overflow-hidden flex bg-background text-foreground">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenAi={openAssistant} hideAiButton={onAiPage} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      {/* Docked: a real column in this flex row, sidebar + main sit beside it. */}
      {showDock && <AiDock />}
      {/* Floating: an overlay Sheet that covers content instead of sharing space. */}
      {showOverlay && <AIPanel />}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AiAssistantProvider>
      <AppShellInner>{children}</AppShellInner>
    </AiAssistantProvider>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-8">
      <div className="space-y-1">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}