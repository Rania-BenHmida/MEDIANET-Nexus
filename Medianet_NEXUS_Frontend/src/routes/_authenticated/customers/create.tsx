// customers/create.tsx — route: /_authenticated/customers/create
//
// Standalone "Add Client" page. Creates a company via the same shared
// dropdownsApi.addCompany() pool used by Projects/Deals, but surfaces every
// field the backend accepts (name, industry, headquarters, year founded,
// revenue, employee count) instead of just the three used in the compact
// popover version. Industry and Headquarters reuse the exact same
// "__new_industry__" / "__new_hq__" sentinel pattern as the Projects/Deals
// AddCompanyPopover, so label rendering and dropdown-refresh behavior stay
// identical.

import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useCompanyIndustries, useCompanyHeadquarters, useAllCompanies } from "@/hooks/use-dropdowns";
import { customerProfileKeys } from "@/hooks/use-customers";
import { dropdownsApi, type NewCompany } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PopoverSelect } from "@/components/forms/SelectPrimitives";
import {
  Building2, Briefcase, MapPin, Calendar, DollarSign, Users,
  Loader2, CheckCircle2, ArrowLeft, Sparkles, AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers/create")({
  component: CreateClientPage,
});

// Same brand palette as Customers/Projects/Deals — alternated per field so
// the form reads as colorful without any single color dominating.
const BRAND = {
  blue:   "#2E5FD9",
  orange: "#F5A623",
  coral:  "#F0564B",
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
  navy:   "#1B2A5B",
};

const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

// Display text for the "＋ Add new…" sentinel options in the two PopoverSelect
// dropdowns below — same purpose as COMPANY_FIELD_LABELS in the Projects
// AddCompanyPopover, just local to this page.
const NEW_OPTION_LABELS: Record<string, string> = {
  __new_industry__: "＋ Add new industry…",
  __new_hq__:       "＋ Add new headquarters…",
};

// Colored icon-chip field row — same visual language as the score/breakdown
// headers on the client fiche (_companyId.tsx), just reused here per-field
// so every input gets its own brand color instead of one flat gray icon.
function ColorField({
  icon: Icon, label, color, required, hint, children,
}: {
  icon: any; label: string; color: string; required?: boolean; hint?: string; children: React.ReactNode;
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
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function GroupLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}55, transparent)` }} />
    </div>
  );
}

const inputCls = "w-full h-10 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all";

function CreateClientPage() {
  const { roles } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: industries = [], isLoading: loadingInd } = useCompanyIndustries();
  const { data: hqOptions  = [], isLoading: loadingHq  } = useCompanyHeadquarters();
  // Full company pool, reused here purely for client-side duplicate
  // detection — same list the "Company" dropdown on Projects/Deals draws
  // from, so a match here means it really is already in the database.
  const { data: allCompanies = [] } = useAllCompanies();

  const [companyName, setCompanyName]     = useState("");
  const [industry, setIndustry]           = useState("");
  const [customIndustry, setCustomInd]    = useState("");
  const [headquarters, setHeadquarters]   = useState("");
  const [customHq, setCustomHq]           = useState("");
  const [yearEstablished, setYearEst]     = useState("");
  const [revenue, setRevenue]             = useState("");
  const [employees, setEmployees]         = useState("");

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAccess("customers", roles)) return <Navigate to="/unauthorized" />;

  const effectiveIndustry = industry === "__new_industry__" ? customIndustry.trim() : industry;
  const effectiveHq       = headquarters === "__new_hq__"   ? customHq.trim()       : headquarters;

  // Case-insensitive, whitespace-trimmed exact match against the existing
  // company pool. This runs live as you type, purely client-side — it's a
  // safety net, not a replacement for a backend uniqueness constraint,
  // since two browser tabs could still race each other.
  const normalizedName = companyName.trim().toLowerCase();
  const duplicate = normalizedName
    ? allCompanies.find((c) => c.name.trim().toLowerCase() === normalizedName)
    : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!companyName.trim()) { setError("Company name is required."); return; }
    if (duplicate) { setError(`"${duplicate.name}" already exists — pick it from an existing form instead of creating a duplicate.`); return; }

    const payload: NewCompany = {
      company_name: companyName.trim(),
      industry: effectiveIndustry || undefined,
      headquarters: effectiveHq || undefined,
      year_established: yearEstablished ? Number(yearEstablished) : undefined,
      revenue: revenue ? Number(revenue) : undefined,
      employees: employees ? Number(employees) : undefined,
    };

    setBusy(true);
    try {
      const created = await dropdownsApi.addCompany(payload);

      // Same cache updates as the AddCompanyPopover, plus the customers list
      // itself so the new client shows up there right away.
      queryClient.setQueryData<{ id: number; name: string }[]>(
        ["dropdowns", "companiesAll"],
        (old = []) => (old.some((c) => c.name === created.name) ? old : [...old, created]),
      );
      await queryClient.invalidateQueries({ queryKey: ["dropdowns", "companyIndustries"] });
      await queryClient.invalidateQueries({ queryKey: ["dropdowns", "companyHeadquarters"] });
      await queryClient.invalidateQueries({ queryKey: customerProfileKeys.list() });

      toast.success(`Client "${created.name}" added`);
      // New clients have zero subscriptions, so they land in the
      // "contract" tab of the list, not "subscribed" — send the user
      // there so the client they just created is actually visible.
      navigate({ to: "/customers/list", search: { type: "contract" } });
    } catch (err: any) {
      setError(err?.message ?? "Failed to create client. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Customers"
        title="Add New Client"
        description="Create a new company record — shared across Customers, Deals, and Projects."
        actions={
          <Link to="/customers/list" search={{ type: "subscribed" }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" /> Back to clients
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          {/* Decorative brand strip */}
          <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${RAINBOW.join(", ")})` }} />

          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold">Client information</h2>
            </div>
            <span className="text-xs text-muted-foreground">{companyName.trim() ? "Ready to create" : "Name required"}</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-5">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2.5 rounded-lg text-sm">{error}</div>
              )}

              <GroupLabel color={BRAND.blue}>Identity</GroupLabel>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorField icon={Building2} label="Company name" color={BRAND.blue} required>
                  <Input
                    className={`${inputCls.replace("h-10 ", "")} ${duplicate ? "border-amber-500/60 focus-visible:ring-amber-500/30" : ""}`}
                    placeholder="e.g. Acme Corp"
                    value={companyName}
                    onChange={(e) => { setCompanyName(e.target.value); setError(null); }} />
                  {duplicate && (
                    <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                        Already exits.{" "}
                        <Link to="/customers/$companyId" params={{ companyId: String(duplicate.id) }}
                          className="font-semibold underline underline-offset-2 hover:opacity-80">
                          View existing client
                        </Link>
                        {" "}instead of creating a duplicate.
                      </p>
                    </div>
                  )}
                </ColorField>

                <ColorField icon={Briefcase} label="Industry" color={BRAND.purple}>
                  {loadingInd
                    ? <div className="h-10 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
                    : <PopoverSelect options={[...industries, "__new_industry__"]} value={industry}
                        onChange={(v) => { setIndustry(v); setError(null); }} placeholder="Select or add industry"
                        labels={NEW_OPTION_LABELS} />}
                  {industry === "__new_industry__" && (
                    <input type="text" value={customIndustry} onChange={(e) => setCustomInd(e.target.value)}
                      placeholder="Type new industry…" className={`${inputCls} mt-1`} />
                  )}
                </ColorField>
              </div>

              <GroupLabel color={BRAND.teal}>Location</GroupLabel>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorField icon={MapPin} label="Headquarters" color={BRAND.teal}>
                  {loadingHq
                    ? <div className="h-10 flex items-center px-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin mr-1.5" />Loading…</div>
                    : <PopoverSelect options={[...hqOptions, "__new_hq__"]} value={headquarters}
                        onChange={(v) => setHeadquarters(v)} placeholder="Select or add headquarters"
                        labels={NEW_OPTION_LABELS} />}
                  {headquarters === "__new_hq__" && (
                    <input type="text" value={customHq} onChange={(e) => setCustomHq(e.target.value)}
                      placeholder="Type new headquarters…" className={`${inputCls} mt-1`} />
                  )}
                </ColorField>

                <ColorField icon={Calendar} label="Year established" color={BRAND.orange} hint="optional">
                  <Input type="number" className={inputCls.replace("h-10 ", "")} placeholder="e.g. 2015"
                    value={yearEstablished} onChange={(e) => setYearEst(e.target.value)} />
                </ColorField>
              </div>

              <GroupLabel color={BRAND.coral}>Company profile</GroupLabel>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorField icon={DollarSign} label="Annual revenue (DT)" color={BRAND.coral} hint="optional">
                  <Input type="number" className={inputCls.replace("h-10 ", "")} placeholder="e.g. 500000"
                    value={revenue} onChange={(e) => setRevenue(e.target.value)} />
                </ColorField>

                <ColorField icon={Users} label="Employees" color={BRAND.navy} hint="optional">
                  <Input type="number" className={inputCls.replace("h-10 ", "")} placeholder="e.g. 120"
                    value={employees} onChange={(e) => setEmployees(e.target.value)} />
                </ColorField>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" size="sm" disabled={busy || !!duplicate}
                style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`, border: "none" }}
                className="text-white hover:opacity-90 transition-opacity disabled:opacity-40">
                {busy
                  ? <><Loader2 className="size-3.5 animate-spin" />Saving…</>
                  : <><CheckCircle2 className="size-3.5" />Create client</>}
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
              <li>Only company name is required — fill in what you know, add the rest later from the client's fiche.</li>
              <li>This company pool is shared with Deals and Projects — search first before adding to avoid duplicates.</li>
              <li>Don't see the right industry or headquarters? Pick "＋ Add new…" at the bottom of the list to type your own.</li>
              <li>Once created, you'll land back on the client list where the new company appears immediately.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}