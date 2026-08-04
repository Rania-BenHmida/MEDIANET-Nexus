import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Pagination } from "@/components/Pagination";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useOpenDeals, useClosedDeals, useDeleteHistoricalDeal, useUpdateClosedDeal, useUpdateOpenDeal } from "@/hooks/use-deals";
import { useStages, useAgents } from "@/hooks/use-dropdowns";
import type { Deal, DealFilters } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Loader2, ChevronUp, ChevronDown, ChevronsUpDown,
  CircleDot, CheckCircle2, XCircle, Trash2, Pencil, AlertTriangle, X,
  Inbox,
  MapPin, Users, Building2, Tag, Calendar, CalendarDays, DollarSign,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/deals/list")({
  component: DealsListPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M DT`;
  if (value >= 1_000)     return `${Math.round(value / 1_000)}K DT`;
  return `${value.toLocaleString()} DT`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Curated, high-signal palette for open-pipeline stages — won/lost are
// handled separately below since they carry semantic meaning (good/bad).
const STAGE_PALETTE = [
  { bg: "bg-sky-500/10",      text: "text-sky-600 dark:text-sky-400",         border: "border-sky-500/20",      dot: "bg-sky-500" },
  { bg: "bg-violet-500/10",   text: "text-violet-600 dark:text-violet-400",   border: "border-violet-500/20",   dot: "bg-violet-500" },
  { bg: "bg-amber-500/10",    text: "text-amber-600 dark:text-amber-400",     border: "border-amber-500/20",    dot: "bg-amber-500" },
  { bg: "bg-orange-500/10",   text: "text-orange-600 dark:text-orange-400",   border: "border-orange-500/20",   dot: "bg-orange-500" },
  { bg: "bg-cyan-500/10",     text: "text-cyan-600 dark:text-cyan-400",       border: "border-cyan-500/20",     dot: "bg-cyan-500" },
  { bg: "bg-fuchsia-500/10",  text: "text-fuchsia-600 dark:text-fuchsia-400", border: "border-fuchsia-500/20",  dot: "bg-fuchsia-500" },
  { bg: "bg-indigo-500/10",   text: "text-indigo-600 dark:text-indigo-400",   border: "border-indigo-500/20",   dot: "bg-indigo-500" },
  { bg: "bg-teal-500/10",     text: "text-teal-600 dark:text-teal-400",       border: "border-teal-500/20",     dot: "bg-teal-500" },
];

// Preferred fixed assignments for common stage names, so colors stay
// stable across renders rather than depending on insertion order. Anything
// not listed falls back to a deterministic hash into STAGE_PALETTE, so
// brand-new custom stages still get a consistent color every time.
const STAGE_COLOR_OVERRIDES: Record<string, number> = {
  prospecting:   0, // sky
  engaging:      1, // violet
  qualification: 2, // amber
  negotiation:   3, // orange
  proposal:      4, // cyan
};

function hashToIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

function stageBadge(stage: string | null, isWon: boolean | null) {
  if (!stage) return <span className="text-muted-foreground text-xs">—</span>;
  const lower = stage.toLowerCase();

  // Won / Lost keep their semantic green/red treatment.
  if (isWon === true || lower === "won") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 ring-1 ring-emerald-500/10">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {stage}
      </span>
    );
  }
  if (isWon === false && lower === "lost") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border tracking-wide bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 ring-1 ring-rose-500/10">
        <span className="size-1.5 rounded-full bg-rose-500" />
        {stage}
      </span>
    );
  }

  // Open-pipeline stages — distinct color per stage name.
  const idx = lower in STAGE_COLOR_OVERRIDES
    ? STAGE_COLOR_OVERRIDES[lower]
    : hashToIndex(lower, STAGE_PALETTE.length);
  const c = STAGE_PALETTE[idx];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border tracking-wide ring-1 ring-inset ring-black/[0.02] dark:ring-white/[0.04] ${c.bg} ${c.text} ${c.border}`}>
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {stage}
    </span>
  );
}

type SortKey = keyof Deal;
type SortDir = "asc" | "desc";


// ── Sort header cell ──────────────────────────────────────────────────────────

function Th({
  label, sortKey, current, dir, onSort, align = "left", icon: Icon,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  icon?: React.ElementType;
}) {
  const active = current === sortKey;
  const SortIcon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={`px-4 py-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {Icon && <Icon className="size-3 opacity-50" />}
        {label}
        <SortIcon className={`size-3 transition-colors ${active ? "text-primary" : "opacity-30"}`} />
      </span>
    </th>
  );
}

// ── Destructive delete modal (Open deals only) ────────────────────────────────

function DeleteWarehouseModal({
  deal, onCancel, onConfirm, busy,
}: {
  deal: Deal; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-destructive/30 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-destructive/10 grid place-items-center shrink-0 ring-4 ring-destructive/5">
            <AlertTriangle className="size-4.5 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">Permanently delete this deal?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This removes the warehouse record for{" "}
              <span className="font-medium text-foreground">{deal.company_name ?? "this deal"}</span> from{" "}
              <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded-md">Fact_Opportunity</code>. This is a
              hard delete with <span className="font-semibold text-destructive">no undo</span> — it also
              affects historical pipeline stats and reports. If the source system still has this record,
              it may reappear on the next data load.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {busy ? "Deleting…" : "Yes, delete permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Close-correction modal (Closed deals only — close_value/close_date) ──────

function EditClosedModal({
  deal, onCancel, onSave, busy,
}: {
  deal: Deal; onCancel: () => void; onSave: (data: { close_value?: number; close_date?: string }) => void; busy: boolean;
}) {
  const [closeValue, setCloseValue] = useState(deal.close_value != null ? String(deal.close_value) : "");
  const [closeDate, setCloseDate]   = useState(deal.close_date ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Correct closed deal</p>
          <button onClick={onCancel} className="size-6 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          {deal.company_name} — only the close value and close date can be corrected here.
        </p>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Close value (DT)</p>
            <Input
              type="number" min={0} value={closeValue}
              onChange={(e) => setCloseValue(e.target.value)}
              className="h-9 bg-background"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Close date</p>
            <Input
              type="date" value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="h-9 bg-background"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onSave({
              close_value: closeValue ? Number(closeValue) : undefined,
              close_date:  closeDate || undefined,
            })}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
            {busy ? "Saving…" : "Save correction"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Edit modal — Open deals (stage / close_value / close_date) ───────────────

function EditOpenModal({
  deal, stages, onCancel, onSave, busy,
}: {
  deal: Deal;
  stages: string[];
  onCancel: () => void;
  onSave: (data: { stage_name?: string; close_value?: number; close_date?: string }) => void;
  busy: boolean;
}) {
  const [stage, setStage]           = useState(deal.stage_name ?? "");
  const [closeValue, setCloseValue] = useState(deal.close_value != null ? String(deal.close_value) : "");
  const [closeDate, setCloseDate]   = useState(deal.close_date ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Edit open deal</p>
          <button onClick={onCancel} className="size-6 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          {deal.company_name} — stage, close value, and close date can be edited here. Moving the
          stage to a Won/Lost stage will close this deal.
        </p>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Stage</p>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-9 bg-background">
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Close value (DT)</p>
            <Input
              type="number" min={0} value={closeValue}
              onChange={(e) => setCloseValue(e.target.value)}
              className="h-9 bg-background"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Close date</p>
            <Input
              type="date" value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="h-9 bg-background"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            size="sm"
            disabled={busy || !stage}
            onClick={() => onSave({
              stage_name:  stage || undefined,
              close_value: closeValue ? Number(closeValue) : undefined,
              close_date:  closeDate || undefined,
            })}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Pagination bar ──────────────────────────────────────────────────────────

// ── Shared deals table ─────────────────────────────────────────────────────────

function DealsTable({
  deals, isLoading, isError, refetch, search, emptyLabel, mode,
  onDelete, onEdit,
}: {
  deals: Deal[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  search: string;
  emptyLabel: string;
  mode: "open" | "closed";
  onDelete?: (deal: Deal) => void;
  onEdit?: (deal: Deal) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("engage_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const visible = [...deals]
    .filter((d) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        d.company_name?.toLowerCase().includes(q) ||
        d.agent_name?.toLowerCase().includes(q)   ||
        d.plan_name?.toLowerCase().includes(q)    ||
        d.stage_name?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

  // Reset to page 1 whenever the underlying result set changes shape
  // (new search term, re-sort, tab switch, or a refetch).
  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir, deals, pageSize]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const tableRef = useRef<HTMLDivElement>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm">Loading deals…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <p className="text-sm text-destructive">Failed to load deals.</p>
        <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <div className="size-12 rounded-full bg-muted grid place-items-center mb-1">
          <Inbox className="size-5 opacity-50" />
        </div>
        <p className="text-sm">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto" ref={tableRef}>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
            <tr>
              <Th label="Company" icon={Building2}    sortKey="company_name" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Agent"   icon={Users}        sortKey="agent_name"   current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Plan"    icon={Tag}          sortKey="plan_name"    current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Stage"   icon={MapPin}       sortKey="stage_name"   current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Engage"  icon={Calendar}     sortKey="engage_date"  current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Close"   icon={CalendarDays} sortKey="close_date"   current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Value"   icon={DollarSign}   sortKey="close_value"  current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <th className="px-3 py-3 w-14" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((deal) => (
              <tr key={deal.id} className="group hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3.5 font-medium text-foreground whitespace-nowrap">{deal.company_name ?? "—"}</td>
                <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{deal.agent_name ?? "—"}</td>
                <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{deal.plan_name ?? "—"}</td>
                <td className="px-4 py-3.5 whitespace-nowrap">{stageBadge(deal.stage_name, deal.is_won)}</td>
                <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap tabular-nums">{fmtDate(deal.engage_date)}</td>
                <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap tabular-nums">{fmtDate(deal.close_date)}</td>
                <td className="px-4 py-3.5 text-foreground whitespace-nowrap tabular-nums font-semibold text-right">{fmt(deal.close_value)}</td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {mode === "open" && onEdit && (
                      <button
                        className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit stage, close value & date"
                        onClick={() => onEdit(deal)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                    {mode === "open" && onDelete && (
                      <button
                        className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete deal (permanent)"
                        onClick={() => onDelete(deal)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    {mode === "closed" && onEdit && (
                      <button
                        className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Correct close value/date"
                        onClick={() => onEdit(deal)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={safePage}
        pageSize={pageSize}
        totalItems={visible.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        scrollTargetRef={tableRef}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "open" | "closed";

function DealsListPage() {
  const { roles } = useAuth();
  if (!canAccess("deals", roles)) return <Navigate to="/unauthorized" />;

  const [tab, setTab] = useState<Tab>("open");
  const [filters, setFilters] = useState<Omit<DealFilters, "stage_group">>({});
  const [search, setSearch]   = useState("");
  const [toDelete, setToDelete] = useState<Deal | null>(null);
  const [toEdit, setToEdit]     = useState<Deal | null>(null);
  const [toEditOpen, setToEditOpen] = useState<Deal | null>(null);

  const openQuery   = useOpenDeals(filters);
  const closedQuery = useClosedDeals(filters);
  const deleteDeal  = useDeleteHistoricalDeal();
  const editClosed  = useUpdateClosedDeal();
  const editOpen    = useUpdateOpenDeal();
  const { data: stages = [] } = useStages();
  const { data: agents = [] } = useAgents();

  const active = tab === "open" ? openQuery : closedQuery;

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await deleteDeal.mutateAsync(toDelete.id);
      toast.success("Deal permanently deleted");
      setToDelete(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete deal");
    }
  }

  async function handleEditSave(data: { close_value?: number; close_date?: string }) {
    if (!toEdit) return;
    try {
      await editClosed.mutateAsync({ id: toEdit.id, data });
      toast.success("Deal corrected");
      setToEdit(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update deal");
    }
  }

  async function handleEditOpenSave(data: { stage_name?: string; close_value?: number; close_date?: string }) {
    if (!toEditOpen) return;
    try {
      await editOpen.mutateAsync({ id: toEditOpen.id, data });
      toast.success("Deal updated");
      setToEditOpen(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update deal");
    }
  }

  return (
    <>
      {toDelete && (
        <DeleteWarehouseModal
          deal={toDelete}
          onCancel={() => setToDelete(null)}
          onConfirm={handleDelete}
          busy={deleteDeal.isPending}
        />
      )}
      {toEdit && (
        <EditClosedModal
          deal={toEdit}
          onCancel={() => setToEdit(null)}
          onSave={handleEditSave}
          busy={editClosed.isPending}
        />
      )}
      {toEditOpen && (
        <EditOpenModal
          deal={toEditOpen}
          stages={stages}
          onCancel={() => setToEditOpen(null)}
          onSave={handleEditOpenSave}
          busy={editOpen.isPending}
        />
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PageHeader
            eyebrow="CRM"
            title="All Deals"
            description="Deals loaded into the warehouse, split by pipeline stage."
          />
          <Link
            to="/deals/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Deal
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          <button
            onClick={() => setTab("open")}
            className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "open"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CircleDot className="size-3.5" />
            Open
            <span className="ml-1 text-xs text-muted-foreground tabular-nums">
              {openQuery.data ? `(${openQuery.data.length})` : ""}
            </span>
            {tab === "open" && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setTab("closed")}
            className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "closed"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="size-3.5" />
            Closed
            <span className="ml-1 text-xs text-muted-foreground tabular-nums">
              {closedQuery.data ? `(${closedQuery.data.length})` : ""}
            </span>
            {tab === "closed" && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search company, agent, plan, stage…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm bg-background"
            />
          </div>
          <div className="relative w-full sm:w-48">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none z-10" />
            <Select
              value={filters.stage_name ?? "__all__"}
              onValueChange={(v) => setFilters((f) => ({ ...f, stage_name: v === "__all__" ? undefined : v }))}
            >
              <SelectTrigger className="h-9 text-sm bg-background pl-9">
                <SelectValue placeholder="Filter by stage…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All stages</SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-48">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none z-10" />
            <Select
              value={filters.agent_name ?? "__all__"}
              onValueChange={(v) => setFilters((f) => ({ ...f, agent_name: v === "__all__" ? undefined : v }))}
            >
              <SelectTrigger className="h-9 text-sm bg-background pl-9">
                <SelectValue placeholder="Filter by agent…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All agents</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(filters.stage_name || filters.agent_name || search) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => { setFilters({}); setSearch(""); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          <DealsTable
            mode={tab}
            deals={active.data ?? []}
            isLoading={active.isLoading}
            isError={active.isError}
            refetch={active.refetch}
            search={search}
            emptyLabel={tab === "open" ? "No open deals found." : "No closed deals found."}
            onDelete={tab === "open" ? setToDelete : undefined}
            onEdit={tab === "open" ? setToEditOpen : tab === "closed" ? setToEdit : undefined}
          />
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <XCircle className="size-3.5 mt-0.5 shrink-0" />
          <p>
            Open deals can have their stage, close value, and close date edited, or be permanently
            deleted. Closed deals (Won/Lost) can only have their close value or close date
            corrected — agent, company, plan, and stage are not editable here. New deals start as{" "}
            <Link to="/deals/create" className="text-primary hover:underline">pending</Link>{" "}
            in the staging queue until Talend loads them into the warehouse.
          </p>
        </div>
      </div>
    </>
  );
}