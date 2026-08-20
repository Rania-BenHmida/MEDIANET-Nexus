import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AiChatView } from "@/components/AiChatView";
import { ListChecks, Users, TrendingUp, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getHomeRoute } from "@/lib/roles";
import medianauteGif from "@/assets/robot-avatar-chat.gif";

export const Route = createFileRoute("/_authenticated/ai/GenBI")({
  component: GenBiPage,
});

// Same brand palette used across Projects/Deals/Customers create & report pages.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};
const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

// Only the modules that actually exist as their own section today — no
// "Support" chip, since tickets live inside Customer Analytics rather than
// being a standalone page anyone navigates to.
const CAPABILITIES = [
  { labelKey: "nav.projects",  icon: ListChecks, color: BRAND.blue },
  { labelKey: "nav.customers", icon: Users,       color: BRAND.purple },
  { labelKey: "nav.deals",     icon: TrendingUp,  color: BRAND.teal },
] as const;

function GenBiPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const homeRoute = getHomeRoute(roles);

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Chat — main column */}
        <div className="lg:col-span-2 min-h-0 bg-card border border-border rounded-xl shadow-[var(--shadow-card)] flex flex-col overflow-hidden">
          {/* Decorative brand strip — same treatment as the Projects/Deals/Customers create cards */}
          <div className="h-1.5 shrink-0" style={{ background: `linear-gradient(90deg, ${RAINBOW.join(", ")})` }} />
          <AiChatView />
        </div>

        {/* ── Sidebar — avatar, intro, capabilities. Same card treatment as
            the "Tips" sidebar on the Projects/Deals/Customers create pages.
            Centered vertically in the column, not pinned to the top. */}
        <div className="h-full flex flex-col justify-center">
          {/* Same link style as the "Dashboard" link on the Projects/list page,
              but labeled "Back" and routed to whatever section this role
              actually lands on first — not hardcoded to /dashboard, since not
              every role can see it. Sits directly above the badge card rather
              than the page corner. getHomeRoute can return null in the
              (currently theoretical) case of a role with no accessible
              section, so the link just doesn't render rather than pointing
              somewhere broken. */}
          {homeRoute && (
            <Link
              to={homeRoute}
              className="mx-auto mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Exit
            </Link>
          )}

          <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-4 border-t-4 text-center" style={{ borderTopColor: BRAND.blue }}>
            <div className="relative mx-auto w-fit">
              <span
                aria-hidden
                className="absolute -inset-2 rounded-full opacity-50 blur-md"
                style={{ background: `conic-gradient(from 0deg, ${BRAND.blue}, ${BRAND.purple}, ${BRAND.teal}, ${BRAND.blue})` }}
              />
              <img
                src={medianauteGif}
                alt=""
                aria-hidden
                className="relative size-20 rounded-full object-cover shadow-md ring-4 ring-background"
                style={{ backgroundColor: BRAND.blue }}
              />
            </div>

            <div>
              <div className="flex items-center justify-center gap-2">
                <h1 className="text-base font-semibold tracking-tight">{t("ai.title")}</h1>
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded text-white"
                  style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
                >
                  BETA
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t("ai.tagline")}</p>
            </div>

            {/* Capability chips — visual reinforcement of what it covers,
                distinct from the suggested prompts inside the chat itself
                (no duplicate text) */}
            <div className="flex flex-col gap-2 pt-1">
              {CAPABILITIES.map(({ labelKey, icon: Icon, color }) => (
                <div
                  key={labelKey}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border"
                  style={{ backgroundColor: `${color}0d`, borderColor: `${color}33`, color }}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {t(labelKey)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}