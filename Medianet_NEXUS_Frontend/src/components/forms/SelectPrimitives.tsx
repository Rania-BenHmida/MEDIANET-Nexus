import { useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2 } from "lucide-react";

// ── Field wrapper ─────────────────────────────────────────────────────────────

export function Field({
  icon: Icon, label, required, children,
}: {
  icon: React.ElementType; label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Popover shell ─────────────────────────────────────────────────────────────

export function PopoverShell({
  title, onClose, children,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouse(e: MouseEvent) {
      const path = e.composedPath() as Element[];
      if (wrapRef.current && path.includes(wrapRef.current as unknown as EventTarget & Element)) return;
      const inRadixPortal = path.some((el) =>
        el?.hasAttribute?.("data-radix-popper-content-wrapper") ||
        el?.hasAttribute?.("data-radix-select-viewport") ||
        el?.getAttribute?.("data-radix-collection-item") != null
      );
      if (inRadixPortal) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onMouse);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={wrapRef}
      className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-card border border-border rounded-xl shadow-[var(--shadow-elevated)] p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <button type="button" onClick={onClose}
          className="size-5 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X className="size-3" />
        </button>
      </div>
      {children}
    </div>
  );
}

// ── Mini select inside popovers ───────────────────────────────────────────────

export function PopoverSelect({
  options, value, onChange, placeholder,
}: {
  options: string[]; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs bg-background">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Searchable select ──────────────────────────────────────────────────────────

export function SearchableSelect({
  options, value, onValueChange, placeholder, searchPlaceholder = "Search…",
  onSearchChange, externalFilter = false, loading = false, selectedLabel: selectedLabelProp,
}: {
  options: { label: string; value: string }[];
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  // ── Server-search opt-ins (all optional; omit for classic client-side behavior) ──
  // Fires as the user types. Wire this to a debounced query to fetch matches.
  onSearchChange?: (q: string) => void;
  // When true, the component does NOT filter locally — it renders `options`
  // as-is, trusting the caller (server) to have already filtered them.
  externalFilter?: boolean;
  // Shows a spinner in the search row while results are being fetched.
  loading?: boolean;
  // The label for the current `value`. Needed in server mode because the
  // selected option may not be present in the latest (filtered) `options`,
  // which would otherwise make the trigger go blank mid-search.
  selectedLabel?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = externalFilter
    ? options
    : query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
      : options;

  // Prefer an explicit selectedLabel (server mode); fall back to looking it up
  // in options (client mode). Preserving it keeps the trigger stable when the
  // selected row scrolls out of the current result set.
  const selectedLabel = selectedLabelProp ?? options.find((o) => o.value === value)?.label;

  function handleQuery(q: string) {
    setQuery(q);
    onSearchChange?.(q);
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-10 bg-background">
        <SelectValue placeholder={placeholder}>
          {selectedLabel ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <div className="sticky top-0 z-10 bg-popover border-b border-border px-2 py-1.5">
          <div className="relative">
            <Input
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => handleQuery(e.target.value)}
              className="h-7 text-xs pr-7"
              onKeyDown={(e) => e.stopPropagation()}
            />
            {loading && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
        {filtered.length === 0
          ? <p className="py-3 text-center text-xs text-muted-foreground">{loading ? "Searching…" : "No results"}</p>
          : filtered.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
          ))
        }
      </SelectContent>
    </Select>
  );
}

// ── Select + separate "+" button beside it ────────────────────────────────────

export function SelectWithAdd({
  children, onAdd, addLabel,
}: {
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1">{children}</div>
      <button type="button" onClick={onAdd} title={`Add new ${addLabel}`}
        className="size-10 shrink-0 rounded-md border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors">
        <Plus className="size-4" />
      </button>
    </div>
  );
}