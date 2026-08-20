import {
  Search, Bell, Moon, Sun, CheckCheck, Send, MessageSquareText, X, Trash2, Handshake, XCircle,
  FolderPlus, ListTodo, RefreshCw, AlertTriangle,
  LayoutDashboard, LayoutGrid, ListChecks, List, Users, TrendingUp, ClipboardList, Shield, Settings,
  Building2, CornerDownLeft, Sparkles,
} from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AskAiTrigger } from "./AskAiTrigger";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, type SectionKey } from "@/lib/roles";
import { customersApi, type CustomerListItem } from "@/lib/api";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useClearAllNotifications,
} from "@/hooks/use-surveys";
import type { SurveyNotification } from "@/lib/api";

export function TopBar({
  onOpenAi,
  hideAiButton,
}: {
  onOpenAi: () => void;
  hideAiButton?: boolean;
}) {
  const { t } = useTranslation();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <header className="h-16 shrink-0 border-b border-border bg-background flex items-center justify-between px-6 gap-6">
      <div className="flex-1 max-w-xl">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <NotificationBell />
        {!hideAiButton && <AskAiTrigger onClick={onOpenAi} />}
      </div>
    </header>
  );
}

// ── Global search ────────────────────────────────────────────────────────────
// Two result groups:
//  1. "Go to" — every page the person actually has access to (canAccess-
//     filtered), matched by label. Always available, no network call.
//  2. "Customers" — live lookup by company name. Customers is the only
//     entity with a real detail route (/customers/$companyId), so it's the
//     only one that can deep-link to a specific record today. Deals and
//     Projects don't have per-record detail pages yet — only list pages —
//     so they're not included here to avoid faking a link that goes nowhere
//     useful. Fetched lazily (only once the search is actually opened), not
//     on every page load.

type QuickLink = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  section: SectionKey | null; // null = always visible (e.g. Settings)
  search?: Record<string, string>;
};

const QUICK_LINKS: QuickLink[] = [
  { to: "/dashboard",      label: "Overview",       icon: LayoutDashboard, section: "dashboard" },
  { to: "/reports",        label: "Reports",        icon: LayoutGrid,      section: "reports" },
  { to: "/projects",       label: "Projects",       icon: ListChecks,      section: "projects" },
  { to: "/projects/list",  label: "All Projects",   icon: List,            section: "projects" },
  { to: "/projects/tasks", label: "Tasks",          icon: ListTodo,        section: "projects" },
  { to: "/customers",      label: "Customers",      icon: Users,           section: "customers" },
  { to: "/customers/list", label: "All Customers",  icon: List,            section: "customers", search: { type: "subscribed" } },
  { to: "/deals",          label: "Deals",          icon: TrendingUp,      section: "deals" },
  { to: "/deals/list",     label: "All Deals",      icon: List,            section: "deals" },
  { to: "/surveys",        label: "Surveys",        icon: ClipboardList,   section: "surveys" },
  { to: "/ai/GenBI",       label: "AI Assistant",   icon: Sparkles,        section: null },
  { to: "/admin",          label: "Role Management",icon: Shield,          section: "roles" },
  { to: "/talend",         label: "Data Refresh",   icon: RefreshCw,       section: "talend" },
  { to: "/settings",       label: "Settings",       icon: Settings,        section: null },
];

function GlobalSearch() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerListItem[] | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSearchCustomers = canAccess("customers", roles);

  const visibleLinks = useMemo(
    () => QUICK_LINKS.filter((l) => l.section === null || canAccess(l.section, roles)),
    [roles],
  );

  const matchedLinks = useMemo(() => {
    if (!query.trim()) return visibleLinks.slice(0, 6);
    const q = query.toLowerCase();
    return visibleLinks.filter((l) => l.label.toLowerCase().includes(q)).slice(0, 6);
  }, [visibleLinks, query]);

  const matchedCustomers = useMemo(() => {
    if (!canSearchCustomers || !query.trim() || !customers) return [];
    const q = query.toLowerCase();
    return customers.filter((c) => c.company.toLowerCase().includes(q)).slice(0, 5);
  }, [canSearchCustomers, customers, query]);

  // ⌘K / Ctrl+K focuses the search from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleFocus() {
    setOpen(true);
    if (canSearchCustomers && customers === null && !loadingCustomers) {
      setLoadingCustomers(true);
      customersApi.list()
        .then(setCustomers)
        .catch(() => setCustomers([]))
        .finally(() => setLoadingCustomers(false));
    }
  }

  function goTo(to: string, search?: Record<string, string>) {
    navigate({ to, search: search as any });
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter") {
      const first = matchedLinks[0];
      if (first) goTo(first.to, first.search);
      else if (matchedCustomers[0]) goTo("/customers/$companyId".replace("$companyId", String(matchedCustomers[0].id)));
    }
  }

  const hasResults = matchedLinks.length > 0 || matchedCustomers.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={t("common.searchPlaceholder")}
          className="w-full bg-muted/60 border border-transparent focus:border-border focus:bg-background rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="max-h-96 overflow-y-auto py-1.5">
            {!hasResults && (
              <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                {loadingCustomers ? "Searching…" : "No matches."}
              </p>
            )}

            {matchedLinks.length > 0 && (
              <div className="px-2 pb-1">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Go to</p>
                {matchedLinks.map((l) => (
                  <button
                    key={l.to + (l.search?.type ?? "")}
                    onClick={() => goTo(l.to, l.search)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                  >
                    <l.icon className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{l.label}</span>
                  </button>
                ))}
              </div>
            )}

            {canSearchCustomers && query.trim() && (matchedCustomers.length > 0 || loadingCustomers) && (
              <div className="px-2 pb-1 border-t border-border/60 pt-1">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customers</p>
                {loadingCustomers && (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">Loading…</p>
                )}
                {matchedCustomers.map((c) => (
                  <Link
                    key={c.id}
                    to="/customers/$companyId"
                    params={{ companyId: String(c.id) }}
                    onClick={() => { setOpen(false); setQuery(""); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                  >
                    <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{c.company}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {hasResults && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
              <CornerDownLeft className="size-3" /> to open first result
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const EVENT_ICON: Record<string, { icon: typeof Send; tone: string }> = {
  survey_sent:      { icon: Send,             tone: "text-sky-500" },
  survey_completed: { icon: MessageSquareText, tone: "text-emerald-500" },
  deal_created:      { icon: Handshake,  tone: "text-violet-500" },
  deal_won:          { icon: Handshake,  tone: "text-emerald-500" },
  deal_lost:         { icon: XCircle,    tone: "text-rose-500" },
  project_created:   { icon: FolderPlus, tone: "text-amber-500" },
  task_created:      { icon: ListTodo,   tone: "text-cyan-500" },
  talend_refresh_success: { icon: RefreshCw,     tone: "text-emerald-500" },
  talend_refresh_failed:  { icon: AlertTriangle, tone: "text-rose-500" },
};

function EventIcon({ eventType }: { eventType: string }) {
  const meta = EVENT_ICON[eventType] ?? { icon: Bell, tone: "text-muted-foreground" };
  const Icon = meta.icon;
  return <Icon className={`size-4 ${meta.tone}`} />;
}

// Short synthesized two-note chime — no audio asset needed, plays once per
// batch of newly-arrived notifications rather than once per item. Wrapped
// in try/catch since some browsers block audio before any user interaction
// on the page; if that happens the popup still shows, it's just silent.
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.09);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    // Audio blocked or unsupported — fail silently, the popup still shows.
  }
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteOne = useDeleteNotification();
  const clearAll = useClearAllNotifications();

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Popup toasts for genuinely NEW arrivals only — not the existing
  // unread pile on first load. seenIds starts as null so the very
  // first data fetch just records what's already there without
  // popping anything; only ids that show up AFTER that get a toast.
  const seenIds = useRef<Set<number> | null>(null);
  const [popups, setPopups] = useState<{ notification: SurveyNotification; leaving: boolean }[]>([]);

  useEffect(() => {
    if (!data) return;
    if (seenIds.current === null) {
      seenIds.current = new Set(data.items.map((n) => n.id));
      return;
    }
    const fresh = data.items.filter((n) => !seenIds.current!.has(n.id));
    if (fresh.length === 0) return;

    fresh.forEach((n) => seenIds.current!.add(n.id));
    setPopups((prev) => [...prev, ...fresh.map((n) => ({ notification: n, leaving: false }))]);
    playNotificationChime();

    fresh.forEach((n) => {
      setTimeout(() => {
        setPopups((prev) => prev.map((p) => (p.notification.id === n.id ? { ...p, leaving: true } : p)));
      }, 4500);
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.notification.id !== n.id));
      }, 4800);
    });
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        className="relative"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold flex items-center justify-center border-2 border-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Ephemeral popups — appear under the bell, auto-dismiss after ~4.5s */}
      {popups.length > 0 && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50 space-y-2 pointer-events-none">
          {popups.map(({ notification: n, leaving }) => (
            <button
              key={n.id}
              onClick={() => {
                markRead.mutate(n.id);
                setPopups((prev) => prev.filter((p) => p.notification.id !== n.id));
              }}
              className={`w-full text-left rounded-lg border border-border bg-popover shadow-lg px-3 py-2.5 flex gap-2.5 pointer-events-auto transition-all duration-300 ${
                leaving ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                <EventIcon eventType={n.eventType} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <CheckCheck className="size-3" />
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={() => clearAll.mutate()}
                  disabled={clearAll.isPending}
                  className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                >
                  <Trash2 className="size-3" />
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <p className="text-xs text-muted-foreground px-4 py-6 text-center">Loading…</p>
            )}
            {!isLoading && items.length === 0 && (
              <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                No notifications yet — you'll see updates here for surveys, deals, and projects.
              </p>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={`group w-full px-4 py-3 border-b border-border/60 last:border-0 flex gap-3 hover:bg-muted/50 transition-colors ${
                  n.isRead ? "opacity-60" : ""
                }`}
              >
                <button
                  onClick={() => !n.isRead && markRead.mutate(n.id)}
                  className="flex gap-3 min-w-0 flex-1 text-left"
                >
                  <div className="mt-0.5 shrink-0">
                    <EventIcon eventType={n.eventType} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </button>
                <button
                  onClick={() => deleteOne.mutate(n.id)}
                  disabled={deleteOne.isPending}
                  aria-label="Delete notification"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}