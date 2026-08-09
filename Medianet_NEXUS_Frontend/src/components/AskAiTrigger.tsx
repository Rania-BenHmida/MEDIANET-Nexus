import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The assistant's entry point in the TopBar — deliberately not a plain
 * labeled button. A slow rotating halo bleeds softly from behind the pill
 * and the sparkle icon breathes gently, so it reads as "quietly intelligent"
 * and easy to spot at a glance, instead of shouting for attention like a
 * generic CTA. One signature motion (the halo); the icon twinkle is subtle
 * enough to support it rather than compete with it.
 */
export function AskAiTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      aria-label={t("common.askAi")}
      className="group relative h-9 rounded-full isolate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {/* Halo — this app's --primary is already a full oklch() color, so we
          reference it directly rather than wrapping it in hsl(). */}
      <span
        aria-hidden
        className="ai-trigger-halo absolute -inset-1 rounded-full opacity-50 blur-md transition-opacity duration-300 group-hover:opacity-80 -z-10"
        style={{
          background:
            "conic-gradient(from 0deg, var(--primary) 0deg, transparent 110deg, var(--primary) 200deg, transparent 320deg, var(--primary) 360deg)",
        }}
      />
      <span className="relative flex items-center gap-2 h-full px-4 rounded-full bg-primary text-primary-foreground shadow-sm group-hover:shadow-md transition-shadow">
        <Sparkles className="ai-trigger-icon size-4 shrink-0" />
        <span className="text-sm font-medium">{t("common.askAi")}</span>
      </span>

      <style>{`
        .ai-trigger-halo { animation: ai-halo-spin 6s linear infinite; }
        .ai-trigger-icon { animation: ai-icon-twinkle 3.2s ease-in-out infinite; }
        @keyframes ai-halo-spin { to { transform: rotate(360deg); } }
        @keyframes ai-icon-twinkle {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.18); opacity: 0.75; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-trigger-halo, .ai-trigger-icon { animation: none !important; }
        }
      `}</style>
    </button>
  );
}