import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useCreateDeal } from "@/hooks/use-deals";
import {
  useCompanies, usePlans, useAgents, useStages,
  useAgentManagers, useAgentOffices,
  useCompanyIndustries, useCompanyHeadquarters,
} from "@/hooks/use-dropdowns";
import type { NewDeal } from "@/lib/api";
import { dropdownsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users, Tag, Building2, MapPin, Calendar,
  DollarSign, CalendarDays, Loader2, CheckCircle2, Plus, X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/deals/create")({
  component: CreateDealPage,
});

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
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

function PopoverShell({
  title, onClose, children,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouse(e: MouseEvent) {
      // composedPath() lets us see portal elements that live outside the DOM tree
      const path = e.composedPath() as Element[];
      // Keep open if the click landed inside this popover
      if (wrapRef.current && path.includes(wrapRef.current as unknown as EventTarget & Element)) return;
      // Keep open if the click landed inside any Radix portal
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
        <button
          type="button"
          onClick={onClose}
          className="size-5 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="size-3" />
        </button>
      </div>
      {children}
    </div>
  );
}

// ── Mini select inside popovers ───────────────────────────────────────────────

function PopoverSelect({
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

// ── Searchable select (no Add button inside — avoids Radix conflict) ──────────

function SearchableSelect({
  options, value, onValueChange, placeholder, searchPlaceholder = "Search…",
}: {
  options: { label: string; value: string }[];
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-10 bg-background">
        {/* 
          Explicitly render the selected label rather than relying on Radix
          to derive it from a mounted <SelectItem>. SelectContent (where
          SelectItems live) only mounts while the listbox is open, so when
          `value` is set programmatically (e.g. auto-selecting a newly
          created stage/company right after an "Add new" popover closes),
          there's no rendered SelectItem for Radix to read the label from
          and the trigger shows blank/placeholder even though `value` is
          correctly set underneath.
        */}
        <SelectValue placeholder={placeholder}>
          {selectedLabel ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <div className="sticky top-0 z-10 bg-popover border-b border-border px-2 py-1.5">
          <Input
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        {filtered.length === 0
          ? <p className="py-3 text-center text-xs text-muted-foreground">No results</p>
          : filtered.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
          ))
        }
      </SelectContent>
    </Select>
  );
}

// ── Field with Select + separate "+" button beside it ────────────────────────
// This is the key fix: the Add button is OUTSIDE SelectContent, not inside it.

function SelectWithAdd({
  children,           // the SearchableSelect
  onAdd,              // called when "+" is clicked
  addLabel,
}: {
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1">{children}</div>
      <button
        type="button"
        onClick={onAdd}
        title={`Add new ${addLabel}`}
        className="size-10 shrink-0 rounded-md border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ── Add Agent popover ─────────────────────────────────────────────────────────

function AddAgentPopover({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const { data: managers = [], isLoading: loadingMgr } = useAgentManagers();
  const { data: offices  = [], isLoading: loadingOff } = useAgentOffices();
  const [fullName, setFullName]           = useState("");
  const [manager, setManager]             = useState("");
  const [customManager, setCustomManager] = useState("");
  const [office, setOffice]               = useState("");
  const [busy, setBusy]                   = useState(false);
  const [err, setErr]                     = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => { firstRef.current?.focus(); }, []);

  const effectiveManager = manager === "__new__" ? customManager.trim() : manager;

  const handleAdd = async () => {
    if (!fullName.trim())  { setErr("Full name is required.");       return; }
    if (!effectiveManager) { setErr("Manager is required.");         return; }
    if (!office)           { setErr("Regional office is required."); return; }
    setBusy(true); setErr(null);
    try {
      const created = await dropdownsApi.addAgent({ full_name: fullName.trim(), manager: effectiveManager, regional_office: office });

      // Optimistic append — same pattern as Company/Stage, kept consistent
      // across all three "add new" popovers so none of them depend on
      // invalidate+refetch timing to make the new value selectable.
      queryClient.setQueryData<string[]>(
        ["dropdowns", "agents"],
        (old = []) => (old.includes(created.Agent_FullName) ? old : [...old, created.Agent_FullName]),
      );
      queryClient.setQueryData<string[]>(
        ["dropdowns", "agentManagers"],
        (old = []) => (old.includes(effectiveManager) ? old : [...old, effectiveManager]),
      );

      toast.success(`Agent "${fullName.trim()}" added`);
      onAdd(created.Agent_FullName);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add agent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverShell title="Add new agent" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Full name *</p>
        <input
          ref={firstRef}
          type="text" value={fullName}
          onChange={(e) => { setFullName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="e.g. Jane Doe"
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
        />
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Manager *</p>
        {loadingMgr
          ? <div className="h-8 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
          : <PopoverSelect options={[...managers, "__new__"]} value={manager} onChange={(v) => { setManager(v); setErr(null); }} placeholder="Select manager" />
        }
        {manager === "__new__" && (
          <input
            type="text" value={customManager}
            onChange={(e) => { setCustomManager(e.target.value); setErr(null); }}
            placeholder="Type new manager name…"
            className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all mt-1"
          />
        )}
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Regional office *</p>
        {loadingOff
          ? <div className="h-8 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
          : <PopoverSelect options={offices} value={office} onChange={(v) => { setOffice(v); setErr(null); }} placeholder="Select office" />
        }
      </div>

      {err && <p className="text-[11px] text-destructive leading-snug">{err}</p>}

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onClose} className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Cancel</button>
        <button type="button" onClick={() => void handleAdd()} disabled={busy}
          className="h-7 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {busy ? "Adding…" : "Add agent"}
        </button>
      </div>
    </PopoverShell>
  );
}

// ── Add Company popover ───────────────────────────────────────────────────────

const COMPANY_FIELD_LABELS: Record<string, string> = {
  __new_industry__: "＋ Add new industry…",
  __new_hq__:       "＋ Add new headquarters…",
};

function AddCompanyPopover({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const { data: industries = [], isLoading: loadingInd } = useCompanyIndustries();
  const { data: hqOptions  = [], isLoading: loadingHq  } = useCompanyHeadquarters();

  const [name, setName]                   = useState("");
  const [industry, setIndustry]           = useState("");
  const [customIndustry, setCustomInd]    = useState("");
  const [headquarters, setHeadquarters]   = useState("");
  const [customHq, setCustomHq]           = useState("");
  const [yearEstablished, setYearEst]     = useState("");
  const [revenue, setRevenue]             = useState("");
  const [employees, setEmployees]         = useState("");
  const [busy, setBusy]                   = useState(false);
  const [err, setErr]                     = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => { firstRef.current?.focus(); }, []);

  const effectiveIndustry = industry === "__new_industry__" ? customIndustry.trim() : industry;
  const effectiveHq       = headquarters === "__new_hq__"   ? customHq.trim()       : headquarters;

  const handleAdd = async () => {
    if (!name.trim()) { setErr("Company name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const created = await dropdownsApi.addCompany({
        company_name:     name.trim(),
        industry:         effectiveIndustry || undefined,
        headquarters:     effectiveHq       || undefined,
        year_established: yearEstablished   ? parseInt(yearEstablished)  : undefined,
        revenue:          revenue           ? parseFloat(revenue)        : undefined,
        employees:        employees         ? parseInt(employees)        : undefined,
      });

      // IMPORTANT: do NOT invalidate ["dropdowns", "companies"] here.
      // That endpoint INNER JOINs Fact_Opportunity, so a brand-new company
      // with zero deals yet would be silently dropped on refetch — making
      // it impossible to select the company you just created. Instead we
      // optimistically append it to the cached list so it's selectable
      // immediately; a future real refetch (once this deal lands in the
      // warehouse) will pick it up naturally from the backend.
      queryClient.setQueryData<{ id: number; name: string }[]>(
        ["dropdowns", "companies"],
        (old = []) => (old.some((c) => c.name === created.name) ? old : [...old, created]),
      );

      // These two are plain dimension-value lists with no Fact_Opportunity
      // join, so a normal invalidate/refetch is safe and correct here.
      await queryClient.invalidateQueries({ queryKey: ["dropdowns", "companyIndustries"] });
      await queryClient.invalidateQueries({ queryKey: ["dropdowns", "companyHeadquarters"] });

      toast.success(`Company "${name.trim()}" added`);
      onAdd(created.name);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add company.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverShell title="Add new company" onClose={onClose}>
      {/* Company name */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Company name *</p>
        <input
          ref={firstRef} type="text" value={name}
          onChange={(e) => { setName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="e.g. Acme Corp"
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
        />
      </div>

      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Optional details</p>

      {/* Industry — dropdown + add new */}
      <div className="space-y-1">
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Industry</p>
        {loadingInd
          ? <div className="h-8 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
          : <Select value={industry} onValueChange={(v) => { setIndustry(v); setErr(null); }}>
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Select or add industry" />
              </SelectTrigger>
              <SelectContent>
                {[...industries, "__new_industry__"].map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">
                    {COMPANY_FIELD_LABELS[o] ?? o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        }
        {industry === "__new_industry__" && (
          <input
            type="text" value={customIndustry}
            onChange={(e) => { setCustomInd(e.target.value); setErr(null); }}
            placeholder="Type new industry…"
            className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all mt-1"
          />
        )}
      </div>

      {/* Headquarters — dropdown + add new */}
      <div className="space-y-1">
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Headquarters</p>
        {loadingHq
          ? <div className="h-8 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
          : <Select value={headquarters} onValueChange={(v) => { setHeadquarters(v); setErr(null); }}>
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Select or add headquarters" />
              </SelectTrigger>
              <SelectContent>
                {[...hqOptions, "__new_hq__"].map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">
                    {COMPANY_FIELD_LABELS[o] ?? o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        }
        {headquarters === "__new_hq__" && (
          <input
            type="text" value={customHq}
            onChange={(e) => { setCustomHq(e.target.value); setErr(null); }}
            placeholder="Type new headquarters…"
            className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all mt-1"
          />
        )}
      </div>

      {/* Numeric fields */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Year est.",    value: yearEstablished, set: setYearEst,  ph: "2001" },
          { label: "Revenue (DT)", value: revenue,         set: setRevenue,  ph: "500000" },
          { label: "Employees",    value: employees,       set: setEmployees,ph: "120" },
        ].map(({ label, value, set, ph }) => (
          <div key={label} className="space-y-0.5">
            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <input type="number" value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
              className="w-full h-7 px-2 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
          </div>
        ))}
      </div>

      {err && <p className="text-[11px] text-destructive leading-snug">{err}</p>}

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onClose} className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Cancel</button>
        <button type="button" onClick={() => void handleAdd()} disabled={busy}
          className="h-7 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {busy ? "Adding…" : "Add company"}
        </button>
      </div>
    </PopoverShell>
  );
}

// ── Add Stage popover ─────────────────────────────────────────────────────────

function AddStagePopover({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const [stageName, setStageName] = useState("");
  const [group, setGroup]         = useState<"Open" | "Closed">("Open");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => { firstRef.current?.focus(); }, []);

  const handleAdd = async () => {
    if (!stageName.trim()) { setErr("Stage name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const created = await dropdownsApi.addStage({ stage_name: stageName.trim(), stage_group: group });

      // Optimistically append rather than invalidate-and-wait. invalidateQueries
      // triggers an async refetch that may not resolve before onAdd/onClose run
      // below, so the SelectContent options can briefly (or not-so-briefly) not
      // contain the stage we just selected — same class of bug as Company.
      queryClient.setQueryData<string[]>(
        ["dropdowns", "stages"],
        (old = []) => (old.includes(created.Stage_Name) ? old : [...old, created.Stage_Name]),
      );

      toast.success(`Stage "${stageName.trim()}" added`);
      onAdd(created.Stage_Name);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add stage.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverShell title="Add new stage" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Stage name *</p>
        <input
          ref={firstRef} type="text" value={stageName}
          onChange={(e) => { setStageName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="e.g. Negotiation"
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
        />
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Stage group *</p>
        <div className="flex rounded-lg overflow-hidden border border-border text-xs font-medium">
          {(["Open", "Closed"] as const).map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)}
              className={[
                "flex-1 py-1.5 transition-colors",
                group === g
                  ? g === "Open" ? "bg-success text-white" : "bg-destructive text-white"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted",
              ].join(" ")}>
              {g}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Is_Closed → <span className="font-medium text-foreground">{group === "Closed" ? "true" : "false"}</span>. Is_Won is always false.
        </p>
      </div>

      {err && <p className="text-[11px] text-destructive leading-snug">{err}</p>}

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onClose} className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Cancel</button>
        <button type="button" onClick={() => void handleAdd()} disabled={busy}
          className="h-7 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {busy ? "Adding…" : "Add stage"}
        </button>
      </div>
    </PopoverShell>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function CreateDealPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState<"agent" | "company" | "stage" | null>(null);

  const { data: companies = [], isLoading: loadingCompanies } = useCompanies();
  const { data: plans     = [], isLoading: loadingPlans }     = usePlans();
  const { data: agents    = [], isLoading: loadingAgents }    = useAgents();
  const { data: stages    = [], isLoading: loadingStages }    = useStages();
  const createDeal = useCreateDeal();

  const loading = loadingCompanies || loadingPlans || loadingAgents || loadingStages;

  const [formData, setFormData] = useState<NewDeal>({
    agent_name:   "",
    plan_name:    "",
    company_name: "",
    stage_name:   "",
    engage_date:  new Date().toISOString().split("T")[0],
    close_value:  undefined,
    close_date:   "",
  });

  if (!canAccess("deals", roles)) return <Navigate to="/unauthorized" />;

  const requiredFields = [formData.agent_name, formData.plan_name, formData.company_name, formData.stage_name, formData.engage_date];
  const filled = requiredFields.filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createDeal.mutateAsync(formData);
      navigate({ to: "/deals" });
    } catch {
      setError("Failed to create deal. Please try again.");
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="CRM"
        title="Create New Deal"
        description="Enter deal details below. Once saved, Talend will pick it up and load it into the warehouse."
      />

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading options…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Form card ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Deal information</h2>
              <div className="flex items-center gap-2.5">
                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${(filled / requiredFields.length) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{filled}/{requiredFields.length}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5">
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2.5 rounded-lg text-sm">{error}</div>
                )}

                {/* Agent + Plan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Agent — "+" button sits beside the select, not inside it */}
                  <Field icon={Users} label="Agent" required>
                    <div className="relative">
                      <SelectWithAdd addLabel="agent" onAdd={() => setAddOpen("agent")}>
                        <SearchableSelect
                          options={agents.map((a) => ({ label: a, value: a }))}
                          value={formData.agent_name}
                          onValueChange={(v) => setFormData({ ...formData, agent_name: v })}
                          placeholder="Select agent"
                          searchPlaceholder="Search agents…"
                        />
                      </SelectWithAdd>
                      {addOpen === "agent" && (
                        <AddAgentPopover
                          onAdd={(name) => setFormData((p) => ({ ...p, agent_name: name }))}
                          onClose={() => setAddOpen(null)}
                        />
                      )}
                    </div>
                  </Field>

                  {/* Plan — no add button */}
                  <Field icon={Tag} label="Plan" required>
                    <SearchableSelect
                      options={plans.map((p) => ({ label: p, value: p }))}
                      value={formData.plan_name}
                      onValueChange={(v) => setFormData({ ...formData, plan_name: v })}
                      placeholder="Select plan"
                      searchPlaceholder="Search plans…"
                    />
                  </Field>
                </div>

                {/* Company + Stage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field icon={Building2} label="Company" required>
                    <div className="relative">
                      <SelectWithAdd addLabel="company" onAdd={() => setAddOpen("company")}>
                        <SearchableSelect
                          options={companies.map((c) => ({ label: c.name, value: c.name }))}
                          value={formData.company_name}
                          onValueChange={(v) => setFormData({ ...formData, company_name: v })}
                          placeholder="Select company"
                          searchPlaceholder="Search companies…"
                        />
                      </SelectWithAdd>
                      {addOpen === "company" && (
                        <AddCompanyPopover
                          onAdd={(name) => setFormData((p) => ({ ...p, company_name: name }))}
                          onClose={() => setAddOpen(null)}
                        />
                      )}
                    </div>
                  </Field>

                  <Field icon={MapPin} label="Stage" required>
                    <div className="relative">
                      <SelectWithAdd addLabel="stage" onAdd={() => setAddOpen("stage")}>
                        <SearchableSelect
                          options={stages.map((s) => ({ label: s, value: s }))}
                          value={formData.stage_name}
                          onValueChange={(v) => setFormData({ ...formData, stage_name: v })}
                          placeholder="Select stage"
                          searchPlaceholder="Search stages…"
                        />
                      </SelectWithAdd>
                      {addOpen === "stage" && (
                        <AddStagePopover
                          onAdd={(name) => setFormData((p) => ({ ...p, stage_name: name }))}
                          onClose={() => setAddOpen(null)}
                        />
                      )}
                    </div>
                  </Field>
                </div>

                <div className="border-t border-border" />

                {/* Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field icon={Calendar} label="Engage date" required>
                    <Input type="date" required className="h-10 bg-background"
                      value={formData.engage_date}
                      onChange={(e) => setFormData({ ...formData, engage_date: e.target.value })} />
                  </Field>
                  <Field icon={CalendarDays} label="Close date">
                    <Input type="date" className="h-10 bg-background"
                      value={formData.close_date ?? ""}
                      onChange={(e) => setFormData({ ...formData, close_date: e.target.value })} />
                  </Field>
                </div>

                {/* Close value */}
                <Field icon={DollarSign} label="Close value (DT)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">DT</span>
                    <Input type="number" min={0} className="h-10 bg-background pl-9" placeholder="0.00"
                      value={formData.close_value ?? ""}
                      onChange={(e) => setFormData({ ...formData, close_value: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                </Field>
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
                <Button type="button" variant="ghost" size="sm" onClick={() => window.history.back()}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createDeal.isPending}>
                  {createDeal.isPending
                    ? <><Loader2 className="size-3.5 animate-spin" />Saving…</>
                    : <><CheckCircle2 className="size-3.5" />Create deal</>}
                </Button>
              </div>
            </form>
          </div>

          {/* ── Tips sidebar ──────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tips</h3>
              <ul className="space-y-3">
                {[
                  { icon: Users,      text: "Agent is the sales person responsible for this deal." },
                  { icon: Tag,        text: "Plan determines the product or service tier." },
                  { icon: Building2,  text: "Company is the partner where the deal originates." },
                  { icon: MapPin,     text: "Stage reflects where the deal sits in the pipeline." },
                  { icon: DollarSign, text: "Close value is optional — add it when the deal is near closing." },
                ].map(({ icon: Icon, text }, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="size-6 rounded-md bg-muted grid place-items-center shrink-0 mt-0.5">
                      <Icon className="size-3 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <p className="text-xs text-primary/80 leading-relaxed">
                Deals saved here are queued as <span className="font-semibold text-primary">pending</span> and loaded into the warehouse automatically by Talend.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}