import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { EmbedReport } from "@/lib/embeds";

/** Strips the chrome (nav pane + filter pane) from a Power BI reportEmbed URL. */
function withHiddenChrome(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}navContentPaneEnabled=false&filterPaneEnabled=false`;
}

export type PowerBIEmbedHandle = {
  refresh: () => void;
  toggleFullscreen: () => void;
};

export const PowerBIEmbed = forwardRef<PowerBIEmbedHandle, { report: EmbedReport }>(
  function PowerBIEmbed({ report }, ref) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // keep isFullscreen in sync even when the user exits via Esc (no click handler fires then)
    useEffect(() => {
      const onChange = () =>
        setIsFullscreen(document.fullscreenElement === wrapperRef.current);
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    useImperativeHandle(ref, () => ({
      refresh: () => setRefreshKey((k) => k + 1),
      toggleFullscreen: () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          wrapperRef.current?.requestFullscreen();
        }
      },
    }));

    const src = useMemo(() => {
      if (!report.embedUrl) return "";
      const base = withHiddenChrome(report.embedUrl);
      // cache-bust so the click actually reloads the report instead of a no-op
      return refreshKey === 0 ? base : `${base}&_r=${refreshKey}`;
    }, [report.embedUrl, refreshKey]);

    if (!report.embedUrl) {
      return (
        <div className="aspect-[16/9] w-full rounded-xl border border-dashed border-border bg-muted/40 grid place-items-center">
          <div className="text-center space-y-3 px-8">
            <div className="size-10 rounded-lg bg-card border border-border grid place-items-center mx-auto">
              <BarChart3 className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{report.title}</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Power BI embed slot — paste the report URL in{" "}
                <code className="font-mono text-[11px] px-1 py-0.5 bg-card border border-border rounded">
                  src/lib/embeds.ts
                </code>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={wrapperRef}
        className={isFullscreen ? "bg-background p-4" : "aspect-[16/9] w-full"}
      >
        <iframe
          key={refreshKey}
          title={report.title}
          src={src}
          className="size-full rounded-xl border border-border bg-card"
          allowFullScreen
        />
      </div>
    );
  },
);