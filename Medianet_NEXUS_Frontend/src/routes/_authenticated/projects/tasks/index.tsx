import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { Pagination } from "@/components/Pagination";
import { useTasks, useUpdateTask, useDeleteTask } from "@/hooks/use-projects";
import { useProjects } from "@/hooks/use-projects";
import { useTags } from "@/hooks/use-dropdowns";
import type { Task } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Loader2, Inbox, Briefcase, Tag as TagIcon, CalendarDays,
  MessageSquare, CheckCircle2, Circle, Trash2, AlertTriangle, X, CircleDot,
  Home, Pencil,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/tasks/")({
  component: TasksListPage,
});

// Same brand palette as projects/list.tsx and deals/list.tsx — reused here
// so Tasks reads as a sibling of both, not a separate visual system.
const BRAND = {
  blue:   "#2E5FD9",
  teal:   "#3EC8C8",
  orange: "#F5A623",
  purple: "#8C5AC8",
  navy:   "#1B2A5B",
  coral:  "#F0564B",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function tagBadge(name: string | null, color: string | null) {
  if (!name) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border tracking-wide"
      style={{
        backgroundColor: `${color ?? "#64748b"}1a`,
        color: color ?? "#64748b",
        borderColor: `${color ?? "#64748b"}33`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color ?? "#64748b" }} />
      {name}
    </span>
  );
}

function DeleteTaskModal({
  task, onCancel, onConfirm, busy,
}: {
  task: Task; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-destructive/30 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-destructive/10 grid place-items-center shrink-0 ring-4 ring-destructive/5">
            <AlertTriangle className="size-4.5 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">Permanently delete this task?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This removes every warehouse row for <span className="font-medium text-foreground">{task.name}</span> from{" "}
              <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded-md">Fact_Log</code>, including its comment
              history. This is a hard delete with <span className="font-semibold text-destructive">no undo</span>.
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

// ── Edit modal — active/in-progress tasks only. The update endpoint only
// accepts tag_id, due_date, end_date, completed — not name/description —
// so this form only exposes what's actually persistable.
function EditTaskModal({
  task, tags, onCancel, onSave, busy,
}: {
  task: Task;
  tags: { id: number; name: string; color: string | null }[];
  onCancel: () => void;
  onSave: (data: { tag_id?: number; due_date?: string; end_date?: string }) => void;
  busy: boolean;
}) {
  const [tagId, setTagId]     = useState<string>(task.tag_id != null ? String(task.tag_id) : "__none__");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [endDate, setEndDate] = useState(task.end_date ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Edit task</p>
          <button onClick={onCancel} className="size-6 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">{task.name}</p>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tag</p>
            <Select value={tagId} onValueChange={setTagId}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="No tag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No tag</SelectItem>
                {tags.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Due date</p>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 bg-background" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">End date</p>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 bg-background" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" disabled={busy}
            style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`, border: "none" }}
            className="text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            onClick={() => onSave({
              tag_id: tagId === "__none__" ? undefined : Number(tagId),
              due_date: dueDate || undefined,
              end_date: endDate || undefined,
            })}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentsPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{task.name} — comments</p>
          <button onClick={onClose} className="size-6 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
        {task.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No comments yet.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {task.comments.map((c) => (
              <div key={c.id} className="p-3 bg-muted/40 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">{c.full_name ?? "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{fmtDate(c.created_at)}</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "active" | "completed";

function TasksListPage() {
  const { roles } = useAuth();
  if (!canAccess("projects", roles)) return <Navigate to="/unauthorized" />;

  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("__all__");
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [toEdit, setToEdit] = useState<Task | null>(null);
  const [toView, setToView] = useState<Task | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: projects = [] } = useProjects();
  const { data: tags = [] } = useTags();
  const { data: tasks = [], isLoading, isError, refetch } = useTasks(
    projectFilter === "__all__" ? undefined : { project_id: Number(projectFilter) }
  );
  const updateTask = useUpdateTask();
  const deleteTask  = useDeleteTask();

  const searched = useMemo(() => tasks.filter((t) => {
    if (tagFilter !== "__all__" && String(t.tag_id ?? "") !== tagFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(q) ||
      t.project_name?.toLowerCase().includes(q) ||
      t.tag_name?.toLowerCase().includes(q)
    );
  }), [tasks, search, tagFilter]);

  // Split by completion — same tab pattern as Projects' Active/Completed
  // and Deals' Open/Closed.
  const activeList    = useMemo(() => searched.filter((t) => !t.completed), [searched]);
  const completedList = useMemo(() => searched.filter((t) => t.completed), [searched]);
  const visible = tab === "active" ? activeList : completedList;

  // Reset to page 1 whenever the result set, tab, or page size changes shape
  useEffect(() => { setPage(1); }, [search, tasks, pageSize, tab, projectFilter, tagFilter]);

  const totalItems = visible.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function toggleComplete(task: Task) {
    try {
      await updateTask.mutateAsync({ id: task.id, data: { completed: !task.completed } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update task");
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await deleteTask.mutateAsync(toDelete.id);
      toast.success("Task permanently deleted");
      setToDelete(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete task");
    }
  }

  async function handleEditSave(data: { tag_id?: number; due_date?: string; end_date?: string }) {
    if (!toEdit) return;
    try {
      await updateTask.mutateAsync({ id: toEdit.id, data });
      toast.success("Task updated");
      setToEdit(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update task");
    }
  }

  return (
    <>
      {toDelete && (
        <DeleteTaskModal task={toDelete} onCancel={() => setToDelete(null)} onConfirm={handleDelete} busy={deleteTask.isPending} />
      )}
      {toEdit && (
        <EditTaskModal task={toEdit} tags={tags} onCancel={() => setToEdit(null)} onSave={handleEditSave} busy={updateTask.isPending} />
      )}
      {toView && <CommentsPanel task={toView} onClose={() => setToView(null)} />}

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PageHeader eyebrow="Projects" title="All Tasks" description="Tasks loaded into the warehouse, across every project." />
          <Link to="/projects/tasks/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all duration-200 shrink-0"
            style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}>
            <Plus className="w-4 h-4" />
            New Task
          </Link>
        </div>

        {/* Tabs — same pattern as Projects' Active/Completed — Projects/Dashboard
            links sit on the same row, right-aligned, mirroring projects/list.tsx */}
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab("active")}
              className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === "active" ? "" : "text-muted-foreground hover:text-foreground"
              }`}
              style={tab === "active" ? { color: BRAND.blue } : undefined}
            >
              <CircleDot className="size-3.5" />
              In Progress
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">({activeList.length})</span>
              {tab === "active" && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ backgroundColor: BRAND.blue }} />
              )}
            </button>
            <button
              onClick={() => setTab("completed")}
              className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === "completed" ? "" : "text-muted-foreground hover:text-foreground"
              }`}
              style={tab === "completed" ? { color: BRAND.teal } : undefined}
            >
              <CheckCircle2 className="size-3.5" />
              Done
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">({completedList.length})</span>
              {tab === "completed" && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ backgroundColor: BRAND.teal }} />
              )}
            </button>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/projects" className="inline-flex items-center gap-1.5 pb-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Home className="size-3.5" /> Dashboard
            </Link>
            <Link to="/projects/list" className="inline-flex items-center gap-1.5 pb-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Briefcase className="size-3.5" /> Projects
            </Link>
          </div>
        </div>

        {/* Filter bar — same pattern as deals/list.tsx: search + colored
            dropdown filters + Clear filters when any are active */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search task, project, tag…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-background" />
          </div>
          <div className="relative w-full sm:w-56">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none z-10" style={{ color: BRAND.purple }} />
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-9 text-sm bg-background pl-9">
                <SelectValue placeholder="Filter by project…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.project_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-48">
            <TagIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none z-10" style={{ color: BRAND.orange }} />
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-9 text-sm bg-background pl-9">
                <SelectValue placeholder="Filter by tag…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All tags</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(projectFilter !== "__all__" || tagFilter !== "__all__" || search) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => { setProjectFilter("__all__"); setTagFilter("__all__"); setSearch(""); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading tasks…</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
              <p className="text-sm text-destructive">Failed to load tasks.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : totalItems === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
              <div className="size-12 rounded-full grid place-items-center mb-1" style={{ backgroundColor: `${BRAND.blue}1a` }}>
                <Inbox className="size-5" style={{ color: BRAND.blue }} />
              </div>
              <p className="text-sm">
                {search.trim() || projectFilter !== "__all__" || tagFilter !== "__all__"
                  ? `No ${tab === "active" ? "in-progress" : "completed"} tasks match your filters.`
                  : tab === "active" ? "No in-progress tasks yet." : "No completed tasks yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto" ref={tableRef}>
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className="px-3 py-3 w-10" />
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[180px]">Task</th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Briefcase className="inline size-3 mr-1" style={{ color: BRAND.purple, opacity: 0.75 }} />Project
                      </th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <TagIcon className="inline size-3 mr-1" style={{ color: BRAND.orange, opacity: 0.75 }} />Tag
                      </th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <CalendarDays className="inline size-3 mr-1" style={{ color: BRAND.coral, opacity: 0.75 }} />Due
                      </th>
                      <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Comments</th>
                      {tab === "active" && (
                        <th className="sticky right-0 z-10 px-3 py-3 w-20 bg-muted/40 border-l border-border" />
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paged.map((task) => (
                      <tr key={task.id} className="group hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3.5">
                          <button onClick={() => toggleComplete(task)} title={task.completed ? "Mark incomplete" : "Mark complete"}
                            className="text-muted-foreground hover:text-primary transition-colors">
                            {task.completed
                              ? <CheckCircle2 className="size-4.5" style={{ color: BRAND.teal }} />
                              : <Circle className="size-4.5" />}
                          </button>
                        </td>
                        <td className={`px-4 py-3.5 font-medium whitespace-nowrap ${task.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                          {task.name}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{task.project_name ?? "—"}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">{tagBadge(task.tag_name, task.tag_color)}</td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap tabular-nums">{fmtDate(task.due_date)}</td>
                        <td className="px-4 py-3.5">
                          <button onClick={() => setToView(task)}
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                            <MessageSquare className="size-3.5" />
                            {task.comments.length}
                          </button>
                        </td>
                        {tab === "active" && (
                          <td className="sticky right-0 z-10 px-3 py-3.5 bg-card group-hover:bg-muted/30 border-l border-border transition-colors">
                            <div className="flex items-center justify-end gap-1">
                              <button className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Edit task" onClick={() => setToEdit(task)}>
                                <Pencil className="size-3.5" />
                              </button>
                              <button className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Delete task (permanent)" onClick={() => setToDelete(task)}>
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
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