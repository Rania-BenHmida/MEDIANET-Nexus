import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useCreateProject, useProjectStatuses } from "@/hooks/use-projects";
import { useEmployees, useAllCompanies, useCompanyIndustries, useCompanyHeadquarters, useSections, useProjectTeams, useEmployeeTeams } from "@/hooks/use-dropdowns";
import type { NewProject, Section } from "@/lib/api";
import { dropdownsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PopoverShell, PopoverSelect, SearchableSelect, SelectWithAdd,
} from "@/components/forms/SelectPrimitives";
import {
  Briefcase, Users, Building2, Calendar, CalendarDays, ListChecks,
  FileText, Loader2, CheckCircle2, Plus, Layers, Sparkles,
  ArrowLeft, Home,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/create")({
  component: CreateProjectPage,
});

// Same brand palette as Customers/Deals — alternated per field so the form
// reads as colorful without any single color dominating.
const BRAND = {
  blue:   "#2E5FD9",
  orange: "#F5A623",
  coral:  "#F0564B",
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
  navy:   "#1B2A5B",
};

const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

// Fallback used only if the live status list is empty/loading. The real list
// comes from useProjectStatuses() — distinct values in Dim_Project.status.
const FALLBACK_STATUSES = ["active", "on_hold", "completed"];

function prettifyStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Small debounce so owner search fires ~250ms after typing stops, not on
// every keystroke.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// Lightweight sub-section divider inside the form — gives the flat field
// stack some visual rhythm without heavy card nesting. Colored dot + fading
// rule line, one brand color per section.
function GroupLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}55, transparent)` }} />
    </div>
  );
}

// Colored icon-chip field row — same visual language as the client fiche's
// breakdown headers, reused here so every input gets its own brand color
// instead of one flat gray icon.
function ColorField({
  icon: Icon, label, color, required, children,
}: {
  icon: any; label: string; color: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="size-6 rounded-md grid place-items-center shrink-0" style={{ backgroundColor: `${color}1a` }}>
          <Icon className="size-3.5" style={{ color }} />
        </div>
        <label className="text-xs font-semibold text-foreground">
          {label} {required && <span style={{ color }}>*</span>}
        </label>
      </div>
      {children}
    </div>
  );
}

// ── Add Employee popover (Owner) ────────────────────────────────────────────

function AddEmployeePopover({ onAdd, onClose }: { onAdd: (id: number, name: string) => void; onClose: () => void }) {
  const { data: teamOptions = [], isLoading: loadingTeams } = useEmployeeTeams();
  const [fullName, setFullName] = useState("");
  const [role, setRole]         = useState("");
  const [email, setEmail]       = useState("");
  const [team, setTeam]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleAdd = async () => {
    if (!fullName.trim()) { setErr("Full name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const created = await dropdownsApi.addEmployee({
        full_name: fullName.trim(),
        role: role.trim() || undefined,
        email: email.trim() || undefined,
        team: team.trim() || undefined,
      });
      // Employee queries are now keyed by search term (["dropdowns",
      // "employees", term]), so a single setQueryData can't reach them all.
      // Invalidate the whole employees family so the list reflects the new
      // hire. onAdd below immediately selects them regardless, so there's no
      // wait for the refetch.
      await queryClient.invalidateQueries({ queryKey: ["dropdowns", "employees"] });
      // A new team value should surface in the team dropdown next time
      if (team.trim()) await queryClient.invalidateQueries({ queryKey: ["dropdowns", "employeeTeams"] });
      toast.success(`Employee "${fullName.trim()}" added`);
      onAdd(created.id, created.full_name);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add employee.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverShell title="Add new employee" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Full name *</p>
        <input type="text" value={fullName}
          onChange={(e) => { setFullName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="e.g. Jane Doe" autoFocus
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Role</p>
        <input type="text" value={role} onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Project Manager"
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Team</p>
        {loadingTeams
          ? <div className="h-8 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
          : <PopoverSelect options={teamOptions} value={team}
              onChange={(v) => { setTeam(v); setErr(null); }} placeholder="Select team" />}
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Email</p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@company.com"
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
      </div>
      {err && <p className="text-[11px] text-destructive leading-snug">{err}</p>}
      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onClose} className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Cancel</button>
        <button type="button" onClick={() => void handleAdd()} disabled={busy}
          style={{ background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})` }}
          className="h-7 px-3 text-xs rounded-md text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {busy ? "Adding…" : "Add employee"}
        </button>
      </div>
    </PopoverShell>
  );
}

// ── Add Company popover (shared pool with Deals) ────────────────────────────

const COMPANY_FIELD_LABELS: Record<string, string> = {
  __new_industry__: "＋ Add new industry…",
  __new_hq__:       "＋ Add new headquarters…",
};

function AddCompanyPopover({ onAdd, onClose }: { onAdd: (id: number, name: string) => void; onClose: () => void }) {
  const { data: industries = [], isLoading: loadingInd } = useCompanyIndustries();
  const { data: hqOptions  = [], isLoading: loadingHq  } = useCompanyHeadquarters();
  const [name, setName]                 = useState("");
  const [industry, setIndustry]         = useState("");
  const [customIndustry, setCustomInd]  = useState("");
  const [headquarters, setHeadquarters] = useState("");
  const [customHq, setCustomHq]         = useState("");
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState<string | null>(null);
  const queryClient = useQueryClient();

  const effectiveIndustry = industry === "__new_industry__" ? customIndustry.trim() : industry;
  const effectiveHq       = headquarters === "__new_hq__"   ? customHq.trim()       : headquarters;

  const handleAdd = async () => {
    if (!name.trim()) { setErr("Company name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const created = await dropdownsApi.addCompany({
        company_name: name.trim(),
        industry: effectiveIndustry || undefined,
        headquarters: effectiveHq || undefined,
      });
      // companiesAll has no Fact_Opportunity join, so optimistic append is safe.
      queryClient.setQueryData<{ id: number; name: string }[]>(
        ["dropdowns", "companiesAll"],
        (old = []) => (old.some((c) => c.name === created.name) ? old : [...old, created]),
      );
      await queryClient.invalidateQueries({ queryKey: ["dropdowns", "companyIndustries"] });
      await queryClient.invalidateQueries({ queryKey: ["dropdowns", "companyHeadquarters"] });

      toast.success(`Company "${name.trim()}" added`);
      onAdd(created.id, created.name);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add company.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverShell title="Add new company" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Company name *</p>
        <input type="text" value={name}
          onChange={(e) => { setName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="e.g. Acme Corp" autoFocus
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
      </div>

      <div className="space-y-1">
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Industry</p>
        {loadingInd
          ? <div className="h-8 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
          : <PopoverSelect options={[...industries, "__new_industry__"]} value={industry}
              onChange={(v) => { setIndustry(v); setErr(null); }} placeholder="Select or add industry"
              labels={COMPANY_FIELD_LABELS} />}
        {industry === "__new_industry__" && (
          <input type="text" value={customIndustry} onChange={(e) => { setCustomInd(e.target.value); setErr(null); }}
            placeholder="Type new industry…"
            className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all mt-1" />
        )}
      </div>

      <div className="space-y-1">
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Headquarters</p>
        {loadingHq
          ? <div className="h-8 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
          : <PopoverSelect options={[...hqOptions, "__new_hq__"]} value={headquarters}
              onChange={(v) => { setHeadquarters(v); setErr(null); }} placeholder="Select or add headquarters"
              labels={COMPANY_FIELD_LABELS} />}
        {headquarters === "__new_hq__" && (
          <input type="text" value={customHq} onChange={(e) => { setCustomHq(e.target.value); setErr(null); }}
            placeholder="Type new headquarters…"
            className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all mt-1" />
        )}
      </div>

      {err && <p className="text-[11px] text-destructive leading-snug">{err}</p>}

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onClose} className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Cancel</button>
        <button type="button" onClick={() => void handleAdd()} disabled={busy}
          style={{ background: `linear-gradient(90deg, ${BRAND.teal}, ${BRAND.blue})` }}
          className="h-7 px-3 text-xs rounded-md text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {busy ? "Adding…" : "Add company"}
        </button>
      </div>
    </PopoverShell>
  );
}

// ── Add Section popover ─────────────────────────────────────────────────────

function AddSectionPopover({ onAdd, onClose }: { onAdd: (code: string, name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleAdd = async () => {
    if (!name.trim()) { setErr("Section name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const created = await dropdownsApi.addSection(name.trim());
      // Append to the cached sections list (backend dedupes by name, so if it
      // already existed we just reuse the returned code — avoid duplicating).
      queryClient.setQueryData<Section[]>(
        ["dropdowns", "sections"],
        (old = []) => (old.some((s) => s.code === created.code) ? old : [...old, created]),
      );
      toast.success(`Section "${created.name}" added`);
      onAdd(created.code, created.name);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add section.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverShell title="Add new section" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Section name *</p>
        <input type="text" value={name}
          onChange={(e) => { setName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="e.g. Marketing" autoFocus
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
      </div>

      {err && <p className="text-[11px] text-destructive leading-snug">{err}</p>}

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onClose} className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Cancel</button>
        <button type="button" onClick={() => void handleAdd()} disabled={busy}
          style={{ background: `linear-gradient(90deg, ${BRAND.orange}, ${BRAND.coral})` }}
          className="h-7 px-3 text-xs rounded-md text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {busy ? "Adding…" : "Add section"}
        </button>
      </div>
    </PopoverShell>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function CreateProjectPage() {
  const { roles } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState<"owner" | "company" | "section" | null>(null);

  // Owner search-as-you-go: the typed term is debounced, then sent to the
  // server so we only ever load ~50 matching employees at a time instead of
  // the whole table.
  const [ownerSearch, setOwnerSearch] = useState("");
  const debouncedOwnerSearch = useDebouncedValue(ownerSearch, 250);
  // Remember the selected owner's label so the trigger stays populated even
  // when that person isn't in the current (filtered) results.
  const [ownerLabel, setOwnerLabel] = useState<string | undefined>(undefined);

  const { data: employees = [], isLoading: loadingEmp, isFetching: fetchingEmp } = useEmployees(debouncedOwnerSearch);
  const { data: companies = [], isLoading: loadingCo }  = useAllCompanies();
  const { data: sections = [] }     = useSections();
  const { data: teamSuggestions = [] } = useProjectTeams();
  const createProject = useCreateProject();
  const { data: liveStatuses } = useProjectStatuses();
  const statusOptions = liveStatuses && liveStatuses.length > 0 ? liveStatuses : FALLBACK_STATUSES;

  // Note: loadingEmp is intentionally NOT here — the owner field fetches on
  // every search, and we don't want that to trigger the full-form loading
  // screen. The owner dropdown shows its own inline spinner instead.
  const loading = loadingCo;

  const [formData, setFormData] = useState<NewProject & { owner_display?: string; company_display?: string; section_display?: string }>({
    project_name: "",
    team_name: "",
    owner_id: undefined,
    company_id: undefined,
    section_code: undefined,
    start_date: "",
    end_date: "",
    status: "active",
    description: "",
  });

  if (!canAccess("projects", roles)) return <Navigate to="/unauthorized" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.project_name.trim()) { setError("Project name is required."); return; }
    try {
      await createProject.mutateAsync({
        project_name: formData.project_name.trim(),
        team_name: formData.team_name || undefined,
        owner_id: formData.owner_id,
        company_id: formData.company_id,
        section_code: formData.section_code || undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
        status: formData.status,
        description: formData.description || undefined,
      });
      navigate({ to: "/projects/list" });
    } catch {
      setError("Failed to create project. Please try again.");
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Projects"
        title="Log New Project"
        description="Owner, company and section are set here once — every task under this project inherits them."
        actions={
          <div className="flex items-center gap-3">
            <Link to="/projects/list" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="size-3.5" /> Back to projects
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading options…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
            {/* Decorative brand strip */}
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${RAINBOW.join(", ")})` }} />

            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold">Project information</h2>
              </div>
              <span className="text-xs text-muted-foreground">{formData.project_name.trim() ? "Ready to create" : "Name required"}</span>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5">
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2.5 rounded-lg text-sm">{error}</div>
                )}

                <ColorField icon={Briefcase} label="Project name" color={BRAND.blue} required>
                  <Input className="h-10 bg-background" placeholder="e.g. Website Redesign"
                    value={formData.project_name}
                    onChange={(e) => setFormData({ ...formData, project_name: e.target.value })} />
                </ColorField>

                <GroupLabel color={BRAND.purple}>Assignment</GroupLabel>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColorField icon={Users} label="Owner" color={BRAND.purple}>
                    <div className="relative">
                      <SelectWithAdd addLabel="owner" onAdd={() => setAddOpen("owner")}>
                        <SearchableSelect
                          options={employees.map((e) => ({ label: e.name, value: String(e.id) }))}
                          value={formData.owner_id ? String(formData.owner_id) : ""}
                          onValueChange={(v) => {
                            const picked = employees.find((e) => String(e.id) === v);
                            setOwnerLabel(picked?.name);
                            setFormData({ ...formData, owner_id: Number(v) });
                          }}
                          placeholder="Select owner"
                          searchPlaceholder="Search employees…"
                          externalFilter
                          onSearchChange={setOwnerSearch}
                          loading={fetchingEmp}
                          selectedLabel={ownerLabel}
                        />
                      </SelectWithAdd>
                      {addOpen === "owner" && (
                        <AddEmployeePopover
                          onAdd={(id, name) => { setOwnerLabel(name); setFormData((p) => ({ ...p, owner_id: id })); }}
                          onClose={() => setAddOpen(null)}
                        />
                      )}
                    </div>
                  </ColorField>

                  <ColorField icon={Building2} label="Company" color={BRAND.teal}>
                    <div className="relative">
                      <SelectWithAdd addLabel="company" onAdd={() => setAddOpen("company")}>
                        <SearchableSelect
                          options={companies.map((c) => ({ label: c.name, value: String(c.id) }))}
                          value={formData.company_id ? String(formData.company_id) : ""}
                          onValueChange={(v) => setFormData({ ...formData, company_id: Number(v) })}
                          placeholder="Select company"
                          searchPlaceholder="Search companies…"
                        />
                      </SelectWithAdd>
                      {addOpen === "company" && (
                        <AddCompanyPopover
                          onAdd={(id) => setFormData((p) => ({ ...p, company_id: id }))}
                          onClose={() => setAddOpen(null)}
                        />
                      )}
                    </div>
                  </ColorField>

                  <ColorField icon={Layers} label="Section" color={BRAND.orange}>
                    <div className="relative">
                      <SelectWithAdd addLabel="section" onAdd={() => setAddOpen("section")}>
                        <SearchableSelect
                          options={sections.map((s) => ({ label: s.name, value: s.code }))}
                          value={formData.section_code ?? ""}
                          onValueChange={(v) => setFormData({ ...formData, section_code: v })}
                          placeholder="Select section"
                          searchPlaceholder="Search sections…"
                        />
                      </SelectWithAdd>
                      {addOpen === "section" && (
                        <AddSectionPopover
                          onAdd={(code) => setFormData((p) => ({ ...p, section_code: code }))}
                          onClose={() => setAddOpen(null)}
                        />
                      )}
                    </div>
                  </ColorField>

                  <ColorField icon={ListChecks} label="Team" color={BRAND.navy}>
                    <Select
                      value={formData.team_name || ""}
                      onValueChange={(v) => setFormData({ ...formData, team_name: v })}
                    >
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamSuggestions.length === 0
                          ? <div className="py-2 px-2 text-xs text-muted-foreground">No teams yet</div>
                          : teamSuggestions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </ColorField>
                </div>

                <GroupLabel color={BRAND.coral}>Timeline</GroupLabel>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ColorField icon={Calendar} label="Start date" color={BRAND.coral}>
                    <Input type="date" className="h-10 bg-background"
                      value={formData.start_date ?? ""}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                  </ColorField>
                  <ColorField icon={CalendarDays} label="End date" color={BRAND.blue}>
                    <Input type="date" className="h-10 bg-background"
                      value={formData.end_date ?? ""}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
                  </ColorField>
                  <ColorField icon={ListChecks} label="Status" color={BRAND.teal}>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger className="h-10 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((s) => <SelectItem key={s} value={s}>{prettifyStatus(s)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </ColorField>
                </div>

                <GroupLabel color={BRAND.navy}>Details</GroupLabel>

                <ColorField icon={FileText} label="Description" color={BRAND.navy}>
                  <textarea rows={4} value={formData.description ?? ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What is this project about?"
                    className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
                </ColorField>
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
                <Button type="button" variant="ghost" size="sm" onClick={() => window.history.back()}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createProject.isPending}
                  style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`, border: "none" }}
                  className="text-white hover:opacity-90 transition-opacity disabled:opacity-40">
                  {createProject.isPending
                    ? <><Loader2 className="size-3.5 animate-spin" />Saving…</>
                    : <><CheckCircle2 className="size-3.5" />Create project</>}
                </Button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-4 border-t-4" style={{ borderTopColor: BRAND.purple }}>
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5" style={{ color: BRAND.purple }} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tips</h3>
              </div>
              <ul className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                <li>Owner, company and section set here apply to every task logged under this project — you won't set them again per-task.</li>
                <li>Company is a shared pool with Deals — search first before adding a new one to avoid duplicates.</li>
                <li>Team is free text — pick an existing one from the list or type a new name.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}