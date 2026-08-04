import { useState, type ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { AIPanel } from "./AIPanel";

export function AppShell({ children }: { children: ReactNode }) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <AppSidebar onOpenAi={() => setAiOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenAi={() => setAiOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <AIPanel open={aiOpen} onOpenChange={setAiOpen} />
    </div>
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
