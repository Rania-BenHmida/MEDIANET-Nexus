// customers/list.tsx — route: /_authenticated/customers/list
// CRM-style grid, split into two tabs by relationship type:
//   - Subscribed clients: nbSubs > 0 (has an active/past subscription)
//   - Contract-based clients: nbSubs === 0 but has deals (or tickets only)
// Clicking a card opens the fiche client at /customers/$companyId.
// Favorited clients (persisted in localStorage) show in a pinned section
// at the top, independent of which tab is active.

import { createFileRoute, Navigate, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useCustomersList } from "@/hooks/use-customers";
import type { CustomerListItem } from "@/lib/api/customers";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/Pagination";
import { Search, Loader2, Inbox, Building2, MapPin, Star, Send, Plus, Home } from "lucide-react";
import { COMPANY_LOGOS } from "@/lib/company-logos";

type ListType = "subscribed" | "contract";

// Same brand palette as Customers/Projects/Deals create & list pages.
const BRAND = {
  blue:   "#2E5FD9",
  orange: "#F5A623",
  coral:  "#F0564B",
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
  navy:   "#1B2A5B",
};
const PALETTE = Object.values(BRAND);

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// Deterministic brand-colored tone per company so the same client always
// gets the same avatar color, without needing a real logo yet.
function avatarColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Favorites — persisted in localStorage, per-browser (not synced across
// devices/users; there's no per-user prefs table on the backend for this) ──
const FAVORITES_KEY = "medianet-nexus:favorite-customers";

function readFavorites(): number[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids: number[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Private browsing / storage disabled — favorites just won't persist.
  }
}

function useFavoriteCustomers() {
  const [favorites, setFavorites] = useState<number[]>(() => readFavorites());

  const toggleFavorite = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeFavorites(next);
      return next;
    });
  }, []);

  return { favorites, toggleFavorite };
}

// ── Shared card, used in both the favorites row and the main grid ────────
function CustomerCard({
  c, isFavorite, onToggleFavorite, showLogo = false,
}: {
  c: CustomerListItem;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  /** Only true for cards in the Favorites row — the main grid always shows initials. */
  showLogo?: boolean;
}) {
  const logoSrc = showLogo ? COMPANY_LOGOS[c.company] : undefined;
  const navigate = useNavigate();

  return (
    <Link to="/customers/$companyId" params={{ companyId: String(c.id) }}
      className="group relative bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors">
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {c.nbSubs > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              navigate({ to: "/surveys", search: { company: c.codeCompany } });
            }}
            className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label="Prepare a survey for this client"
            title="Prepare a survey for this client"
          >
            <Send className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(c.id); }}
          className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={`size-4 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 pr-14">
        <div
          className={`size-11 rounded-full grid place-items-center font-semibold text-sm shrink-0 overflow-hidden ${logoSrc ? "bg-white border border-border" : ""}`}
          style={logoSrc ? undefined : { backgroundColor: `${avatarColor(c.company)}1a`, color: avatarColor(c.company) }}
        >
          {logoSrc ? (
            <img src={logoSrc} alt={`${c.company} logo`} className="size-9 object-contain" />
          ) : (
            initials(c.company)
          )}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{c.company}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <Building2 className="size-3 shrink-0" style={{ color: BRAND.purple }} />{c.industry ?? "—"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <MapPin className="size-3" style={{ color: BRAND.teal }} />{c.headquarters ?? "—"}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center border-t border-border pt-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: BRAND.blue }}>{c.nbSubs}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Subs</p>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: BRAND.coral }}>{c.nbTickets}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tickets</p>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: BRAND.orange }}>{c.nbDeals}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deals</p>
        </div>
      </div>
    </Link>
  );
}

export const Route = createFileRoute("/_authenticated/customers/list")({
  // Tab state lives in the URL (?type=subscribed|contract) — same pattern
  // as the B2B/B2C tabs on the Customers overview page.
  validateSearch: (search: Record<string, unknown>): { type: ListType } => ({
    type: search.type === "contract" ? "contract" : "subscribed",
  }),
  component: CustomersListPage,
});

function CustomersListPage() {
  const { roles } = useAuth();
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading, isError, refetch } = useCustomersList();
  const { type } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { favorites, toggleFavorite } = useFavoriteCustomers();

  const subscribed = useMemo(() => customers.filter((c) => c.nbSubs > 0), [customers]);
  const contractBased = useMemo(() => customers.filter((c) => c.nbSubs === 0), [customers]);
  const activeList = type === "subscribed" ? subscribed : contractBased;

  const favoriteCustomers = useMemo(
    () => activeList.filter((c) => favorites.includes(c.id)),
    [activeList, favorites],
  );

  const visible = useMemo(() => activeList.filter((c) => {
    if (favorites.includes(c.id)) return false; // shown in Favorites instead, not duplicated here
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.company.toLowerCase().includes(q) || (c.industry ?? "").toLowerCase().includes(q);
  }), [activeList, search, favorites]);

  // ── Pagination — client-side, resets whenever the tab or search changes ──
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(1);
  }, [search, type]);

  const paged = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize],
  );

  if (!canAccess("customers", roles)) return <Navigate to="/unauthorized" />;

  const setType = (next: ListType) => navigate({ search: { type: next } });

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        eyebrow="Customers"
        title="Client accounts"
        description={
          type === "subscribed"
            ? "Clients with an active or past subscription."
            : "Clients engaged through one-off deals rather than a subscription."
        }
        actions={
          <Link
            to="/customers/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all duration-200 shrink-0"
            style={{ background: "linear-gradient(90deg, #2E5FD9, #8C5AC8)" }}
          >
            <Plus className="w-4 h-4" />
            New Client
          </Link>
        }
      />

      {/* Tiny segment nav — same pattern as the overview page's B2B/B2C tabs.
          Customers Overview link sits on the same row, right-aligned, same
          pattern as Project/Deals Overview on their list pages. */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setType("subscribed")}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
              type === "subscribed" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            style={type === "subscribed" ? { color: BRAND.blue } : undefined}
          >
            Subscribed Clients ({subscribed.length})
          </button>
          <button
            onClick={() => setType("contract")}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
              type === "contract" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            style={type === "contract" ? { color: BRAND.teal } : undefined}
          >
            Contract-Based Clients ({contractBased.length})
          </button>
        </div>
        <Link to="/customers" search={{ segment: "b2b" }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <Home className="size-3.5" /> Dashboard
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none" style={{ color: BRAND.blue }} />
        <Input placeholder="Search company or industry…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-background" />
      </div>

      {/* ── Favorites — pinned, independent of the tab above ──────────── */}
      {favoriteCustomers.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Star className="size-3.5 fill-amber-400 text-amber-400" /> Favorites
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {favoriteCustomers.map((c) => (
              <CustomerCard key={c.id} c={c} isFavorite onToggleFavorite={toggleFavorite} showLogo />
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" style={{ color: BRAND.blue }} /><span className="text-sm">Loading customers…</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <p className="text-sm text-destructive">Couldn't load customers.</p>
          <button onClick={() => refetch()} className="text-sm font-medium text-primary hover:underline">Try again</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <div className="size-12 rounded-full grid place-items-center mb-1" style={{ backgroundColor: `${BRAND.blue}1a` }}>
            <Inbox className="size-5" style={{ color: BRAND.blue }} />
          </div>
          <p className="text-sm">{search.trim() ? "No client matches your search." : "No clients in this category yet."}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {paged.map((c) => (
              <CustomerCard
                key={c.id}
                c={c}
                isFavorite={favorites.includes(c.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={visible.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            scrollTargetRef={gridRef}
          />
        </div>
      )}
    </div>
  );
}