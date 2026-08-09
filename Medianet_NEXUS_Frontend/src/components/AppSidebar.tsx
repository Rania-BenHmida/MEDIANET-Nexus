import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  TrendingUp,
  Shield,
  Settings,
  LogOut,
  Sparkles,
  ChevronRight,
  List,
  Plus,
  BarChart3,
  PieChart,
  MonitorPlay,
  ListTodo,
  ListPlus,
  RefreshCw,
  ClipboardList,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, ROLE_LABELS, type SectionKey } from "@/lib/roles";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type SubItem = {
  to: string;
  label: string;
  icon: typeof List;
};

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  section: SectionKey;
  /** Sub-routes shown when this item is expanded */
  children?: SubItem[];
};

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    labelKey: "nav.overview",
    icon: LayoutDashboard,
    section: "dashboard",
  },
  {
    to: "/projects",
    labelKey: "nav.projects",
    icon: ListChecks,
    section: "projects",
    children: [
      { to: "/projects",             label: "Reports",        icon: MonitorPlay },
      { to: "/projects/list",        label: "All Projects",   icon: List        },
      { to: "/projects/create",      label: "Log Project",    icon: Plus        },
      { to: "/projects/tasks",       label: "All Tasks",      icon: ListTodo    },
      { to: "/projects/tasks/create",label: "Log Task",       icon: ListPlus    },
    ],
  },,
  {
    to: "/customers",
    labelKey: "nav.customers",
    icon: Users,
    section: "customers",
    children: [
      // Root page is KPIs + embed — a true analytics dashboard
      { to: "/customers",        label: "Dashboard",      icon: PieChart    },
      { to: "/customers/list",   label: "All Customers",  icon: List        },
      { to: "/customers/create", label: "Add Customer",   icon: Plus        },
    ],
  },
  {
    to: "/surveys",
    labelKey: "Surveys",   // or just: label: "Surveys" — matching whichever pattern your other entries use
    icon: ClipboardList,
    section: "surveys",
    children: [
      { to: "/surveys",           label: "Templates", icon: List },
      { to: "/surveys/contacts",  label: "Client Feedback",   icon: Users },   // <- was "Contacts"
    ],
  },
  {
    to: "/deals",
    labelKey: "nav.deals",
    icon: TrendingUp,
    section: "deals",
    children: [
      // Root page is KPIs + Power BI embed — pipeline dashboard
      { to: "/deals",        label: "Pipeline",   icon: BarChart3 },
      { to: "/deals/list",   label: "All Deals",  icon: List      },
      { to: "/deals/create", label: "Log Deal",   icon: Plus      },
    ],
  },
].filter(Boolean) as NavItem[];;

const SYSTEM: NavItem[] = [
  { to: "/admin",  labelKey: "nav.roles",  icon: Shield,   section: "roles" },
  { to: "/talend", labelKey: "nav.talend", icon: RefreshCw, section: "talend" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { profile, roles, signOut, user } = useAuth();
  const { t } = useTranslation();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const [isLogoHovered, setIsLogoHovered] = useState(false);
  // Track which sections are expanded. Auto-expand if we're already inside one.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV.forEach((item) => {
      if (item.children && (path === item.to || path.startsWith(item.to + "/"))) {
        init[item.to] = true;
      }
    });
    return init;
  });

  // Auto-expand the active section when navigating externally (e.g. direct URL)
  useEffect(() => {
    NAV.forEach((item) => {
      if (item.children && (path === item.to || path.startsWith(item.to + "/"))) {
        setExpanded((prev) => (prev[item.to] ? prev : { ...prev, [item.to]: true }));
      }
    });
  }, [path]);

  const isActive = (p: string) => path === p || path.startsWith(p + "/");
  const isExactActive = (p: string) => path === p;

  const toggleExpand = (to: string) => {
    setExpanded((prev) => ({ ...prev, [to]: !prev[to] }));
  };

  const visibleNav    = NAV.filter((n) => canAccess(n.section, roles));
  const visibleSystem = SYSTEM.filter((n) => canAccess(n.section, roles));

  const primaryRole = roles[0];
  const initials = (profile?.displayName ?? user?.email ?? "?")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside className="sticky top-0 h-screen w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      {/* Logo — fixed height so swapping mark <-> wordmark on hover never
          reflows the nav items below; both variants just center inside it. */}
      <div
        className="h-20 px-5 flex items-center gap-2.5 cursor-pointer shrink-0"
        onMouseEnter={() => setIsLogoHovered(true)}
        onMouseLeave={() => setIsLogoHovered(false)}
      >
        {!isLogoHovered ? (
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-6 overflow-y-auto">
        {/* Business units */}
        <div>
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
            {t("nav.businessUnits")}
          </p>
          <div className="space-y-0.5">
            {visibleNav.map((item) => {
              const active      = isActive(item.to);
              const isOpen      = !!expanded[item.to];
              const hasChildren = !!item.children?.length;

              return (
                <div key={item.to}>
                  {/* Parent row */}
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                      active
                        ? "bg-sidebar-active text-sidebar-foreground font-medium"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/50",
                    )}
                  >
                    {/* Click the icon+label to navigate; click the chevron to expand */}
                    <Link
                      to={item.to}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>

                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.to)}
                        className="ml-auto shrink-0 size-5 flex items-center justify-center rounded hover:bg-sidebar-active transition-colors"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        <ChevronRight
                          className={cn(
                            "size-3.5 transition-transform duration-200",
                            isOpen && "rotate-90",
                          )}
                        />
                      </button>
                    )}

                    {/* Active dot (only when no chevron) */}
                    {active && !hasChildren && (
                      <span className="ml-auto size-1.5 rounded-full bg-primary" />
                    )}
                  </div>

                  {/* Sub-items */}
                  {hasChildren && isOpen && (
                    <div className="ml-4 mt-0.5 mb-1 border-l border-sidebar-border pl-3 space-y-0.5">
                      {item.children!.map((child) => {
                        const childActive = isExactActive(child.to);
                        return (
                          <Link
                            key={child.to}
                            to={child.to}
                            className={cn(
                              "flex items-center gap-2.5 px-2.5 py-1.5 text-xs rounded-md transition-colors",
                              childActive
                                ? "bg-sidebar-active text-sidebar-foreground font-medium"
                                : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/40",
                            )}
                          >
                            <child.icon className="size-3.5 shrink-0" />
                            {child.label}
                            {childActive && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* System */}
        {visibleSystem.length > 0 && (
          <div>
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
              {t("nav.system")}
            </p>
            <div className="space-y-0.5">
              {visibleSystem.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                      active
                        ? "bg-sidebar-active text-sidebar-foreground font-medium"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/50",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Intelligence */}
        <div>
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
            {t("nav.intelligence")}
          </p>
          <Link
            to="/ai/GenBI"
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
              isActive("/ai/GenBI")
                ? "bg-sidebar-active text-sidebar-foreground font-medium"
                : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-active/50",
            )}
          >
            <Sparkles className="size-4 shrink-0" />
            <span>{t("nav.aiAssistant")}</span>
            <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary">BETA</span>
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
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
        <div className="flex gap-1">
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
        </div>
      </div>
    </aside>
  );
}