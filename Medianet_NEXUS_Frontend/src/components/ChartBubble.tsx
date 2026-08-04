import { useRef } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Download } from "lucide-react";
import type { GenbiChart } from "@/lib/api";

// Explicit, vivid palette. Self-contained hex values so colors render reliably
// regardless of how CSS variables are defined in the theme (Tailwind v4 stores
// --primary as raw channels, which recharts can't consume directly).
const COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
];

const AXIS = "#94a3b8";   // slate-400, readable on light & dark
const GRID = "#e2e8f0";   // slate-200

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid " + GRID,
  background: "#ffffff",
  color: "#0f172a",
} as const;

/**
 * Decide whether a log Y-axis helps. Log is only worth the perceptual tradeoff
 * when the values span a large range (big bars dwarf small ones). We look at the
 * ratio between the largest and smallest POSITIVE value; if the top is 50x+ the
 * bottom, small bars would be invisible on a linear scale, so log earns its
 * place. Returns false for zero/negative data (log can't render those).
 */
function shouldUseLogScale(data: Record<string, unknown>[], key: string): boolean {
  const nums = data
    .map((d) => Number(d[key]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length < 3) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (min <= 0) return false;
  return max / min >= 50;
}

function safeName(title: string, ext: string) {
  const base = (title || "chart").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "chart"}.${ext}`;
}

/**
 * Rasterize the chart's rendered SVG to a PNG and trigger a download.
 * recharts renders a plain <svg>, so we serialize it, paint it onto a canvas
 * at 2x for a crisp image, and save. No extra dependencies.
 */
function downloadPng(container: HTMLElement | null, title: string) {
  if (!container) return;
  const svg = container.querySelector("svg");
  if (!svg) return;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const svgString = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const scale = 2; // retina-crisp export
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    // White background so the PNG isn't transparent/black on dark themes.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob((png) => {
      if (!png) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = safeName(title, "png");
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

export function ChartBubble({ chart }: { chart: GenbiChart }) {
  const { type, x, y, data, title } = chart;
  const containerRef = useRef<HTMLDivElement>(null);
  const logScale = type === "bar" && shouldUseLogScale(data, y);
  return (
    <div className="mt-2 w-full max-w-[90%] rounded-xl border border-border bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground truncate">{title}</p>
          {logScale && (
            <span
              className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600"
              title="Values span a wide range, so the vertical axis uses a logarithmic scale to keep small bars visible. Bar heights are not linearly comparable."
            >
              LOG
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => downloadPng(containerRef.current, title)}
          className="shrink-0 grid place-items-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Download chart as PNG"
          title="Download PNG"
        >
          <Download className="size-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart data={data} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey={x} tick={{ fontSize: 10 }} stroke={AXIS} />
              <YAxis tick={{ fontSize: 10 }} stroke={AXIS} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey={y}
                stroke="url(#lineStroke)"
                strokeWidth={3}
                dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#0ea5e9" }}
              />
            </LineChart>
          ) : type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={y}
                nameKey={x}
                cx="50%"
                cy="50%"
                outerRadius={70}
                paddingAngle={2}
                label={{ fontSize: 10 }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#ffffff" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey={x} tick={{ fontSize: 10 }} stroke={AXIS} />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke={AXIS}
                scale={logScale ? "log" : "auto"}
                domain={logScale ? [0.8, "dataMax"] : undefined}
                allowDataOverflow={logScale}
allowDecimals={false}
              />
              <Tooltip cursor={{ fill: "rgba(148,163,184,0.15)" }} contentStyle={tooltipStyle} />
              <Bar dataKey={y} radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}