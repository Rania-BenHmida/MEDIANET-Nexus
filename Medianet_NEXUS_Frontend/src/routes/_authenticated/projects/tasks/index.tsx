import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useTasks, useUpdateTask, useDeleteTask } from "@/hooks/use-projects";
import { useProjects } from "@/hooks/use-projects";
import type { Task } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Loader2, Inbox, Briefcase, Tag as TagIcon, CalendarDays,
  MessageSquare, CheckCircle2, Circle, Trash2, AlertTriangle, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/tasks/")({
  component: TasksListPage,
});

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

function TasksListPage() {
  const { roles } = useAuth();
  if (!canAccess("projects", roles)) return <Navigate to="/unauthorized" />;

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("__all__");
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [toView, setToView] = useState<Task | null>(null);

  const { data: projects = [] } = useProjects();
  const { data: tasks = [], isLoading, isError, refetch } = useTasks(
    projectFilter === "__all__" ? undefined : { project_id: Number(projectFilter) }
  );
  const updateTask = useUpdateTask();
  const deleteTask  = useDeleteTask();

  const visible = tasks.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(q) ||
      t.project_name?.toLowerCase().includes(q) ||
      t.tag_name?.toLowerCase().includes(q)
    );
  });

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

  return (
    <>
      {toDelete && (
        <DeleteTaskModal task={toDelete} onCancel={() => setToDelete(null)} onConfirm={handleDelete} busy={deleteTask.isPending} />
      )}
      {toView && <CommentsPanel task={toView} onClose={() => setToView(null)} />}

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PageHeader eyebrow="Projects" title="All Tasks" description="Tasks loaded into the warehouse, across every project." />
          <Link to="/projects/tasks/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all duration-200 shrink-0">
            <Plus className="w-4 h-4" />
            New Task
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search task, project, tag…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-background" />
          </div>
          <div className="relative w-full sm:w-56">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none z-10" />
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
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
              <div className="size-12 rounded-full bg-muted grid place-items-center mb-1"><Inbox className="size-5 opacity-50" /></div>
              <p className="text-sm">No tasks found.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-3 w-10" />
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Task</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><Briefcase className="inline size-3 mr-1 opacity-50" />Project</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><TagIcon className="inline size-3 mr-1 opacity-50" />Tag</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><CalendarDays className="inline size-3 mr-1 opacity-50" />Due</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Comments</th>
                  <th className="px-3 py-3 w-14" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((task) => (
                  <tr key={task.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3.5">
                      <button onClick={() => toggleComplete(task)} title={task.completed ? "Mark incomplete" : "Mark complete"}
                        className="text-muted-foreground hover:text-primary transition-colors">
                        {task.completed
                          ? <CheckCircle2 className="size-4.5 text-emerald-500" />
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
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete task (permanent)" onClick={() => setToDelete(task)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}