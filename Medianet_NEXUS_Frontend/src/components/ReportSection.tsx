import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PowerBIEmbed } from "./PowerBIEmbed";
import type { EmbedReport } from "@/lib/embeds";
import { Star, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportSection({ reports }: { reports: EmbedReport[] }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  if (reports.length === 0) return null;

  const toggleFav = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Tabs defaultValue={reports[0].id} className="w-full">
      <TabsList className="bg-muted/60">
        {reports.map((r) => (
          <TabsTrigger key={r.id} value={r.id} className="data-[state=active]:bg-card">
            {r.title}
          </TabsTrigger>
        ))}
      </TabsList>
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
                onClick={() => toggleFav(r.id)}
                aria-label="Bookmark report"
              >
                <Star
                  className={`size-4 ${favorites.has(r.id) ? "fill-warning text-warning" : "text-muted-foreground"}`}
                />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Expand">
                <Maximize2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <PowerBIEmbed report={r} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
