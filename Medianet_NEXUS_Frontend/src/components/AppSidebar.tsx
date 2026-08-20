import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  Shield,
  Settings,
  LogOut,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  List,
  Plus,
  BarChart3,
  PieChart,
  MonitorPlay,
  ListPlus,
  RefreshCw,
  ClipboardList,
  LayoutGrid,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, ROLE_LABELS, type SectionKey } from "@/lib/roles";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type NavItem = {
  to: string;
  /** Either an i18n key (resolved through t()) or a plain literal label —
   * both work since t() just returns the key back when there's no matching
   * translation, same trick already used elsewhere in this file. */
  labelKey: string;
  icon: typeof LayoutDashboard;
  section: SectionKey;
  /** Only used on the single Intelligence entry today. */
  badge?: string;
};

type NavGroup = {
  headerKey: string;
  items: NavItem[];
};

// ── Nav config ────────────────────────────────────────────────────────────────
// Fully flat: every destination is its own row. Grouping is purely visual
// (a header label, same as "System" always was) — there are no more
// expand/collapse accordions anywhere in the sidebar. A group's header only
// renders if at least one of its items is visible to the current role.

const GROUPS: NavGroup[] = [
  {
    headerKey: "Executive",
    items: [
      { to: "/dashboard", labelKey: "Overview", icon: LayoutDashboard, section: "reports" },
      { to: "/reports",   labelKey: "Reports",   icon: LayoutGrid,     section: "reports" },
    ],
  },
  {
    headerKey: "nav.projects",
    items: [
      { to: "/projects",        labelKey: "Reports",      icon: MonitorPlay, section: "projects" },
      { to: "/projects/list",   labelKey: "All Projects", icon: List,        section: "projects" },
      { to: "/projects/create", labelKey: "Log Project",  icon: Plus,        section: "projects" },
    ],
  },
  {
    headerKey: "Tasks",
    items: [
      // Same "projects" permission as the Projects group above — this is a
      // flattened-out subsection, not a separate access tier.
      { to: "/projects/tasks",        labelKey: "All Tasks", icon: List,     section: "projects" },
      { to: "/projects/tasks/create", labelKey: "Log Task",  icon: ListPlus, section: "projects" },
    ],
  },
  {
    headerKey: "nav.customers",
    items: [
      // Root page is KPIs + embed — a true analytics dashboard
      { to: "/customers",        labelKey: "Dashboard",     icon: PieChart, section: "customers" },
      { to: "/customers/list",   labelKey: "All Customers", icon: List,     section: "customers" },
      { to: "/customers/create", labelKey: "Add Customer",  icon: Plus,     section: "customers" },
    ],
  },
  {
    headerKey: "Surveys",
    items: [
      { to: "/surveys",          labelKey: "Prepare Survey",  icon: ClipboardList, section: "surveys" },
      { to: "/surveys/contacts", labelKey: "Client Feedback", icon: Users,         section: "surveys" },
    ],
  },
  {
    headerKey: "nav.deals",
    items: [
      // Root page is KPIs + Power BI embed — pipeline dashboard
      { to: "/deals",        labelKey: "Pipeline",  icon: BarChart3, section: "deals" },
      { to: "/deals/list",   labelKey: "All Deals", icon: List,      section: "deals" },
      { to: "/deals/create", labelKey: "Log Deal",  icon: Plus,      section: "deals" },
    ],
  },
  {
    headerKey: "nav.intelligence",
    items: [
      { to: "/ai/GenBI", labelKey: "nav.aiAssistant", icon: Sparkles, section: "ai", badge: "BETA" },
    ],
  },
  {
    headerKey: "nav.system",
    items: [
      { to: "/admin",  labelKey: "nav.roles",  icon: Shield,    section: "roles"  },
      { to: "/talend", labelKey: "nav.talend", icon: RefreshCw, section: "talend" },
    ],
  },
];

const ALL_ITEMS: NavItem[] = GROUPS.flatMap((g) => g.items);

/**
 * Resolves which single nav item "owns" a given path, using longest-prefix-
 * wins — the same principle a router uses to pick the most specific match.
 * Needed because several items share a URL prefix after flattening (e.g.
 * Templates at "/surveys" vs Client Feedback at "/surveys/contacts", or
 * Projects' "Reports" at "/projects" vs the whole Tasks group under
 * "/projects/tasks/*") — without this, a loose "starts with" check would
 * make multiple siblings light up as active at once.
 */
function resolvePathOwner(p: string): NavItem | null {
  let best: { item: NavItem; len: number } | null = null;
  for (const item of ALL_ITEMS) {
    if ((p === item.to || p.startsWith(item.to + "/")) && (!best || item.to.length > best.len)) {
      best = { item, len: item.to.length };
    }
  }
  return best?.item ?? null;
}

// Persisted so the collapsed/expanded choice survives a refresh — per
// browser, same pattern as favorite-customers in customers/list.tsx.
const SIDEBAR_COLLAPSED_KEY = "medianet-nexus:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Private browsing / storage disabled — just won't persist.
  }
}

// ── Row ───────────────────────────────────────────────────────────────────────

/**
 * A single nav row. Its own component (not an inline closure) so each row
 * gets its own hover/position state via hooks — needed for the portal
 * below.
 *
 * Collapsed mode: the tooltip is rendered through createPortal straight
 * into document.body, positioned with fixed coordinates computed from the
 * row's own bounding box on hover. This is deliberate, not decorative —
 * the nav list sits in a container with overflow-y-auto, and per the CSS
 * spec, setting overflow-y to anything other than visible silently forces
 * the computed overflow-x to auto too, even if overflow-x is explicitly
 * set to visible in the stylesheet. That clips any absolutely-positioned
 * tooltip that pokes out past the 68px collapsed rail — a portal sidesteps
 * the clipping entirely by not being a descendant of that container at all.
 */
function NavRow({
  item,
  collapsed,
  isActive,
  label,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (!collapsed) {
    return (
      <Link
        to={item.to}
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
          isActive
            ? "bg-sidebar-active text-sidebar-foreground font-medium"
            : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/50",
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className="truncate flex-1 min-w-0">{label}</span>
        {item.badge && (
          <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary">
            {item.badge}
          </span>
        )}
        {isActive && !item.badge && <span className="ml-auto size-1.5 rounded-full bg-primary shrink-0" />}
      </Link>
    );
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ top: r.top + r.height / 2, left: r.right + 8 });
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        to={item.to}
        className={cn(
          "flex items-center justify-center h-9 rounded-md transition-colors",
          isActive
            ? "bg-sidebar-active text-sidebar-foreground"
            : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/50",
        )}
      >
        <item.icon className="size-4 shrink-0" />
      </Link>
      {hovered && pos && createPortal(
        <span
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
          className="pointer-events-none z-[100] whitespace-nowrap rounded-md border border-sidebar-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
        >
          {label}
        </span>,
        document.body,
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { profile, roles, signOut, user } = useAuth();
  const { t } = useTranslation();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readCollapsed());

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  const active = resolvePathOwner(path);

  // Each group's header (its "section name", same idea as the old "Business
  // Units"/"System" labels) only renders when at least one item inside it
  // passes canAccess for the current role — a role that can't see anything
  // in a group never sees that group's name either, collapsed or not.
  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => canAccess(i.section, roles)),
  })).filter((g) => g.items.length > 0);

  // Scroll indicator — no visible scrollbar; instead a tiny fading chevron
  // at the bottom, shown only while there's actually more to scroll to
  // (hidden once everything fits, or once scrolled to the bottom).
  const navRef = useRef<HTMLElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = () => {
    const el = navRef.current;
    if (!el) return;
    setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  };

  useEffect(() => {
    checkScroll();
    const el = navRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
    // Re-check whenever the visible item count or collapsed state changes
    // the nav's content height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, roles.join(","), path]);

  const primaryRole = roles[0];
  const initials = (profile?.displayName ?? user?.email ?? "?")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-52",
      )}
    >
      {/* Logo — fixed height so swapping mark <-> wordmark on hover never
          reflows the nav items below; both variants just center inside it. */}
      <div
        className={cn(
          "h-20 flex items-center shrink-0",
          collapsed ? "justify-center px-2" : "justify-between pl-5 pr-2 gap-2.5",
        )}
      >
        <div
          className="flex items-center gap-2.5 cursor-pointer min-w-0"
          onMouseEnter={() => setIsLogoHovered(true)}
          onMouseLeave={() => setIsLogoHovered(false)}
        >
          {collapsed ? (
            <img src="data/images/logo-mark.png" alt="Medianet" className="h-8 w-auto object-contain" />
          ) : !isLogoHovered ? (
            <>
              <img src="data/images/logo-mark.png" alt="Medianet" className="h-8 w-auto object-contain" />
              <div className="flex flex-col leading-tight">
                <span className="font-semibold tracking-tight text-base">MEDIANET</span>
                <span className="text-[10px] text-sidebar-muted uppercase tracking-widest">Nexus</span>
              </div>
            </>
          ) : (
            <img src="data/images/logo-wordmark.png" alt="Medianet Nexus" className="h-14 w-auto object-contain" />
          )}
        </div>

        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="shrink-0 size-7 flex items-center justify-center rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/50 transition-colors"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <ChevronsLeft className="size-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="px-2 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="w-full h-8 flex items-center justify-center rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/50 transition-colors"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronsRight className="size-4" />
          </button>
        </div>
      )}

      {/* Nav — one loop over every group. A group's header text (its "name",
          same role Business Units/System used to play alone) only shows
          when the group actually has visible items for this role, and is
          hidden entirely in the collapsed rail — each item's own hover
          tooltip carries the naming instead. */}
      <div className="relative flex-1 min-h-0">
        <nav
          ref={navRef}
          onScroll={checkScroll}
          className={cn(
            "h-full py-2 space-y-6 overflow-y-auto",
            // Hide the native scrollbar cross-browser — replaced by the
            // fading chevron indicator below instead of a visible track.
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {visibleGroups.map((group) => (
            <div key={group.headerKey}>
              {!collapsed && (
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
                  {t(group.headerKey)}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    isActive={active?.to === item.to}
                    label={t(item.labelKey)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Scroll indicator — only visible while there's more below, fades
            into the sidebar background rather than sitting as a hard line. */}
        {canScrollDown && (
          <button
            type="button"
            onClick={() => navRef.current?.scrollBy({ top: navRef.current.clientHeight * 0.6, behavior: "smooth" })}
            aria-label="Scroll down"
            className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center pb-1 pt-5 bg-gradient-to-t from-sidebar to-transparent"
          >
            <ChevronDown className="size-3.5 text-sidebar-muted animate-bounce" />
          </button>
        )}
      </div>

      {/* Footer */}
      <div className={cn("border-t border-sidebar-border space-y-1", collapsed ? "p-2" : "p-3")}>
        {collapsed ? (
          <div className="relative group/tooltip flex justify-center">
            <div className="size-8 rounded-full bg-primary/20 text-primary grid place-items-center text-xs font-semibold">
              {initials || "?"}
            </div>
            <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-sidebar-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 z-50 transition-opacity group-hover/tooltip:opacity-100">
              {profile?.displayName ?? t("common.account")}
              {primaryRole ? ` · ${ROLE_LABELS[primaryRole]}` : ""}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-active/50">
            <div className="size-8 rounded-full bg-primary/20 text-primary grid place-items-center text-xs font-semibold">
              {initials || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{profile?.displayName ?? t("common.account")}</p>
              <p className="text-[10px] text-sidebar-muted truncate">
                {primaryRole ? ROLE_LABELS[primaryRole] : t("common.noRole")}
              </p>
            </div>
          </div>
        )}
        <div className={cn("flex gap-1", collapsed && "flex-col")}>
          {collapsed ? (
            <>
              <div className="relative group/tooltip">
                <Link
                  to="/settings"
                  className="w-full h-8 flex items-center justify-center text-sidebar-muted hover:text-sidebar-foreground rounded-md hover:bg-sidebar-active/50 transition-colors"
                >
                  <Settings className="size-3.5" />
                </Link>
                <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-sidebar-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 z-50 transition-opacity group-hover/tooltip:opacity-100">
                  {t("common.settings")}
                </span>
              </div>
              <div className="relative group/tooltip">
                <button
                  onClick={() => void signOut()}
                  className="w-full h-8 flex items-center justify-center text-sidebar-muted hover:text-sidebar-foreground rounded-md hover:bg-sidebar-active/50 transition-colors"
                >
                  <LogOut className="size-3.5" />
                </button>
                <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-sidebar-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 z-50 transition-opacity group-hover/tooltip:opacity-100">
                  {t("common.signOut")}
                </span>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/settings"
                className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 text-xs text-sidebar-muted hover:text-sidebar-foreground rounded-md hover:bg-sidebar-active/50 transition-colors"
              >
                <Settings className="size-3.5" />
                {t("common.settings")}
              </Link>
              <button
                onClick={() => void signOut()}
                className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 text-xs text-sidebar-muted hover:text-sidebar-foreground rounded-md hover:bg-sidebar-active/50 transition-colors"
              >
                <LogOut className="size-3.5" />
                {t("common.signOut")}
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}