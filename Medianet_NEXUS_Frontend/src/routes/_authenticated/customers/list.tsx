// customers/list.tsx — route: /_authenticated/customers/list
// CRM-style grid: one card per real client (nb_subs + nb_tickets + nb_deals > 0),
// clicking a card opens the fiche client at /customers/$companyId.

import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useCustomersList } from "@/hooks/use-customers";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Inbox, Building2, MapPin } from "lucide-react";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// Deterministic pastel-ish tone per company so the same client always
// gets the same avatar color, without needing a real logo yet.
const AVATAR_TONES = [
  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "bg-rose-500/10 text-rose-600 dark:text-rose-400",
];
function avatarTone(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export const Route = createFileRoute("/_authenticated/customers/list")({
  component: CustomersListPage,
});

function CustomersListPage() {
  const { roles } = useAuth();
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading, isError, refetch } = useCustomersList();

  const visible = useMemo(() => customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.company.toLowerCase().includes(q) || (c.industry ?? "").toLowerCase().includes(q);
  }), [customers, search]);

  if (!canAccess("customers", roles)) return <Navigate to="/unauthorized" />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <PageHeader eyebrow="Customers" title="Client accounts" description="Every client with a subscription, ticket, or deal on record." />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input placeholder="Search company or industry…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-background" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading customers…</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <p className="text-sm text-destructive">Couldn't load customers.</p>
          <button onClick={() => refetch()} className="text-sm font-medium text-primary hover:underline">Try again</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <div className="size-12 rounded-full bg-muted grid place-items-center mb-1"><Inbox className="size-5 opacity-50" /></div>
          <p className="text-sm">{search.trim() ? "No client matches your search." : "No clients yet."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((c) => (
            <Link key={c.id} to="/customers/$companyId" params={{ companyId: String(c.id) }}
              className="group bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className={`size-11 rounded-full grid place-items-center font-semibold text-sm shrink-0 ${avatarTone(c.company)}`}>
                  {initials(c.company)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{c.company}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Building2 className="size-3 shrink-0" />{c.industry ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
                <MapPin className="size-3" />{c.headquarters ?? "—"}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center border-t border-border pt-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.nbSubs}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Subs</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.nbTickets}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tickets</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.nbDeals}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deals</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
