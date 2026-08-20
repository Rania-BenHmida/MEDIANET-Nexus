import { useTranslation } from "react-i18next";
import robotAvatar from "@/assets/robot-avatar-topbar.gif";

/**
 * The assistant's entry point in the TopBar. Renders the transparent-bg
 * robot mascot GIF (src/assets/robot-avatar-topbar.gif) inside a small
 * animated halo, with a green "online" dot to reinforce the avatar read —
 * a presence you can talk to, not just a generic CTA button.
 *
 * `avatarSrc` can override the default mascot with a different image/gif
 * later without touching anything else here.
 */
export function AskAiTrigger({
  onClick,
  avatarSrc = robotAvatar,
}: {
  onClick: () => void;
  avatarSrc?: string;
}) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      aria-label={t("common.askAi")}
      title={t("common.askAi")}
      className="group relative size-9 rounded-full isolate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 shrink-0"
    >
      {/* Halo — this app's --primary is already a full oklch() color, so we
          reference it directly rather than wrapping it in hsl(). */}
      <span
        aria-hidden
        className="ai-trigger-halo absolute -inset-1 rounded-full opacity-60 blur-sm transition-opacity duration-300 group-hover:opacity-90 -z-10"
        style={{
          background:
            "conic-gradient(from 0deg, var(--primary) 0deg, transparent 110deg, var(--primary) 200deg, transparent 320deg, var(--primary) 360deg)",
        }}
      />

      <img
        src={avatarSrc}
        alt=""
        aria-hidden
        className="relative size-9 rounded-full object-cover shadow-sm group-hover:shadow-md transition-shadow ring-2 ring-background"
      />

      {/* Small "online" dot — reinforces the avatar read (a presence, not
          just a button) without adding any text. */}
      <span
        aria-hidden
        className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success ring-2 ring-background"
      />

      <style>{`
        .ai-trigger-halo { animation: ai-halo-spin 6s linear infinite; }
        @keyframes ai-halo-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .ai-trigger-halo { animation: none !important; }
        }
      `}</style>
    </button>
  );
}