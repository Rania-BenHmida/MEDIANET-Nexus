import { useRef, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PowerBIEmbed, type PowerBIEmbedHandle } from "./PowerBIEmbed";
import type { EmbedReport } from "@/lib/embeds";
import { RefreshCw, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportSection({ reports, actions }: { reports: EmbedReport[]; actions?: ReactNode }) {
  const embedRefs = useRef<Record<string, PowerBIEmbedHandle | null>>({});
  if (reports.length === 0) return null;

  return (
    <Tabs defaultValue={reports[0].id} className="w-full">
      <div className="flex items-center justify-between gap-4">
        <TabsList className="bg-muted/60">
          {reports.map((r) => (
            <TabsTrigger key={r.id} value={r.id} className="data-[state=active]:bg-card">
              {r.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {actions}
      </div>
      {reports.map((r) => (
        <TabsContent key={r.id} value={r.id} className="mt-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold tracking-tight">{r.title}</h3>
              {r.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => embedRefs.current[r.id]?.refresh()}
                aria-label="Refresh report"
              >
                <RefreshCw className="size-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => embedRefs.current[r.id]?.toggleFullscreen()}
                aria-label="Expand"
              >
                <Maximize2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <PowerBIEmbed
            ref={(el) => {
              embedRefs.current[r.id] = el;
            }}
            report={r}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}