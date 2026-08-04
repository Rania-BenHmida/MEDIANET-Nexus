import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useProjects, useUpdateProject, useProjectStatuses } from "@/hooks/use-projects";
import { Pagination } from "@/components/Pagination";
import type { Project } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Loader2, Pencil, X, Inbox, Building2, Users, Calendar,
  Layers, UsersRound,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/list")({
  component: ProjectsListPage,
});

// Fallback statuses used only if the live list from the API is empty or
// still loading — the real list is fetched via useProjectStatuses() and
// reflects whatever is actually in Dim_Project.status (incl. values Talend
// may add). These three are the known baseline.
const FALLBACK_STATUSES = ["active", "on_hold", "completed"];


// snake_case -> "Title Case" for display. Generic: any value like
// "on_hold" or "in_review" prettifies correctly with no extra code.
function prettifyStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Badge colors keyed by canonical (snake_case) value. Extra keys for
// statuses not currently in the dropdown are harmless — they just let
// any pre-existing/Talend-loaded rows render with their proper color.
const STATUS_TONE: Record<string, string> = {
  planning:  "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  active:    "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  on_hold:   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  cancelled: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string | null) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border tracking-wide ${STATUS_TONE[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {prettifyStatus(status)}
    </span>
  );
}

function EditProjectModal({
  project, onCancel, onSave, busy,
}: {
  project: Project; onCancel: () => void;
  onSave: (data: { status?: string; start_date?: string; end_date?: string; description?: string }) => void;
  busy: boolean;
}) {
  const [status, setStatus]         = useState(project.status ?? "active");
  const [startDate, setStartDate]   = useState(project.start_date ?? "");
  const [endDate, setEndDate]       = useState(project.end_date ?? "");
  const [description, setDescription] = useState(project.description ?? "");

  // Live status list, with fallback. Also fold in this project's own current
  // status so the Select always has a matching option even if it's an
  // unusual value not returned by the distinct query.
  const { data: liveStatuses } = useProjectStatuses();
  const statusOptions = Array.from(
    new Set([...(liveStatuses ?? FALLBACK_STATUSES), ...(project.status ? [project.status] : [])])
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Edit project</p>
          <button onClick={onCancel} className="size-6 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">{project.project_name}</p>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</p>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => <SelectItem key={s} value={s}>{prettifyStatus(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Start date</p>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 bg-background" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">End date</p>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 bg-background" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Description</p>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full px-2.5 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" disabled={busy}
            onClick={() => onSave({ status, start_date: startDate || undefined, end_date: endDate || undefined, description: description || undefined })}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectsListPage() {
  const { roles } = useAuth();

  const [search, setSearch] = useState("");
  const [toEdit, setToEdit] = useState<Project | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const tableRef = useRef<HTMLDivElement>(null);
  const { data: projects = [], isLoading, isError, refetch } = useProjects();
  const updateProject = useUpdateProject();

  const visible = useMemo(() => projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.project_name?.toLowerCase().includes(q) ||
      p.company_name?.toLowerCase().includes(q) ||
      p.owner_name?.toLowerCase().includes(q)
    );
  }), [projects, search]);

  // Reset to page 1 whenever the result set or page size changes shape
  useEffect(() => { setPage(1); }, [search, projects, pageSize]);

  const totalItems = visible.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!canAccess("projects", roles)) return <Navigate to="/unauthorized" />;

  async function handleSave(data: { status?: string; start_date?: string; end_date?: string; description?: string }) {
    if (!toEdit) return;
    try {
      await updateProject.mutateAsync({ id: toEdit.id, data });
      toast.success("Project updated");
      setToEdit(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update project");
    }
  }

  return (
    <>
      {toEdit && (
        <EditProjectModal project={toEdit} onCancel={() => setToEdit(null)} onSave={handleSave} busy={updateProject.isPending} />
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PageHeader eyebrow="Projects" title="All Projects" description="Every project in the warehouse, with owner and client." />
          <Link to="/projects/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-lg shadow-sm transition-colors duration-200 shrink-0">
            <Plus className="w-4 h-4" />
            New project
          </Link>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search project, company, owner…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-background" />
        </div>

        <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading projects…</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
              <p className="text-sm text-destructive">Couldn't load projects.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : totalItems === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
              <div className="size-12 rounded-full bg-muted grid place-items-center mb-1"><Inbox className="size-5 opacity-50" /></div>
              <p className="text-sm">{search.trim() ? "No projects match your search." : "No projects yet."}</p>
              {!search.trim() && (
                <Link to="/projects/create" className="text-sm font-medium text-primary hover:underline">Create the first one</Link>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto" ref={tableRef}>
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[180px]">Project</th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><Users className="inline size-3 mr-1 opacity-50" />Owner</th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><Building2 className="inline size-3 mr-1 opacity-50" />Company</th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><UsersRound className="inline size-3 mr-1 opacity-50" />Team</th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><Layers className="inline size-3 mr-1 opacity-50" />Section</th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><Calendar className="inline size-3 mr-1 opacity-50" />Start</th>
                      <th className="px-4 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">End</th>
                      <th className="px-3 py-3 w-14" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paged.map((p) => (
                      <tr key={p.id} className="group hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3.5 font-medium text-foreground">{p.project_name}</td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{p.owner_name ?? "—"}</td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{p.company_name ?? "—"}</td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{p.team_name ?? "—"}</td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{p.section_name ?? "—"}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">{statusBadge(p.status)}</td>
                        <td className="px-4 py-3.5 text-right text-muted-foreground whitespace-nowrap tabular-nums">{fmtDate(p.start_date)}</td>
                        <td className="px-4 py-3.5 text-right text-muted-foreground whitespace-nowrap tabular-nums">{fmtDate(p.end_date)}</td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Edit project" onClick={() => setToEdit(p)}>
                              <Pencil className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                scrollTargetRef={tableRef}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}