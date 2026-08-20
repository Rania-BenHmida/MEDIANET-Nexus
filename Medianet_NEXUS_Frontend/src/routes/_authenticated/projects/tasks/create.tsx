import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { PageHeader } from "@/components/AppShell";
import { useCreateTask } from "@/hooks/use-projects";
import { useProjects } from "@/hooks/use-projects";
import { useTags } from "@/hooks/use-dropdowns";
import type { NewTask } from "@/lib/api";
import { dropdownsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PopoverShell, SearchableSelect, SelectWithAdd,
} from "@/components/forms/SelectPrimitives";
import {
  ListTodo, Briefcase, Tag as TagIcon, CalendarDays, FileText,
  Loader2, CheckCircle2, Plus, Sparkles, ArrowLeft,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/tasks/create")({
  component: CreateTaskPage,
});

// Same brand palette as projects/create.tsx — tasks live under the same
// module, so the create pages should read as siblings, not separate tools.
const BRAND = {
  blue:   "#2E5FD9",
  orange: "#F5A623",
  coral:  "#F0564B",
  teal:   "#3EC8C8",
  purple: "#8C5AC8",
  navy:   "#1B2A5B",
};

const RAINBOW = [BRAND.blue, BRAND.purple, BRAND.coral, BRAND.orange, BRAND.teal, BRAND.navy];

const TAG_PALETTE = ["#64748b", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#06b6d4"];

// Colored icon-chip field row — same visual language as projects/create.tsx's
// ColorField, so every input gets its own brand color instead of one flat
// gray icon.
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

// Colored section divider — same dot + fading rule as the other create pages.
function GroupLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}55, transparent)` }} />
    </div>
  );
}

// ── Add Tag popover ────────────────────────────────────────────────────────

function AddTagPopover({ onAdd, onClose }: { onAdd: (id: number, name: string) => void; onClose: () => void }) {
  const [name, setName]   = useState("");
  const [color, setColor] = useState(TAG_PALETTE[0]);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleAdd = async () => {
    if (!name.trim()) { setErr("Tag name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const created = await dropdownsApi.addTag({ name: name.trim(), color });
      queryClient.setQueryData<{ id: number; name: string; color: string | null }[]>(
        ["dropdowns", "tags"],
        (old = []) => (old.some((t) => t.id === created.id) ? old : [...old, created]),
      );
      toast.success(`Tag "${name.trim()}" added`);
      onAdd(created.id, created.name);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add tag.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverShell title="Add new tag" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tag name *</p>
        <input type="text" value={name}
          onChange={(e) => { setName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="e.g. Urgent" autoFocus
          className="w-full h-8 px-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Color</p>
        <div className="flex flex-wrap gap-1.5">
          {TAG_PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="size-6 rounded-full transition-transform"
              style={{ backgroundColor: c, outline: color === c ? "2px solid var(--foreground)" : "none", outlineOffset: 2 }}
            />
          ))}
        </div>
      </div>

      {err && <p className="text-[11px] text-destructive leading-snug">{err}</p>}

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onClose} className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Cancel</button>
        <button type="button" onClick={() => void handleAdd()} disabled={busy}
          style={{ background: `linear-gradient(90deg, ${BRAND.orange}, ${BRAND.coral})` }}
          className="h-7 px-3 text-xs rounded-md text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {busy ? "Adding…" : "Add tag"}
        </button>
      </div>
    </PopoverShell>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function CreateTaskPage() {
  const { roles } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [addTagOpen, setAddTagOpen] = useState(false);

  const { data: projects = [], isLoading: loadingProjects } = useProjects();
  const { data: tags     = [], isLoading: loadingTags }     = useTags();
  const createTask = useCreateTask();

  const loading = loadingProjects || loadingTags;

  const [formData, setFormData] = useState({
    name: "",
    project_id: undefined as number | undefined,
    project_name: "",
    tag_id: undefined as number | undefined,
    tag_name: "",
    due_date: "",
    description: "",
  });

  if (!canAccess("projects", roles)) return <Navigate to="/unauthorized" />;

  const requiredFields = [formData.name, formData.project_id];
  const filled = requiredFields.filter(Boolean).length;

  const handleProjectChange = (v: string) => {
    const project = projects.find((p) => String(p.id) === v);
    setFormData((p) => ({ ...p, project_id: project?.id, project_name: project?.project_name ?? "" }));
  };

  const handleTagChange = (v: string) => {
    const tag = tags.find((t) => String(t.id) === v);
    setFormData((p) => ({ ...p, tag_id: tag?.id, tag_name: tag?.name ?? "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.name.trim())    { setError("Task name is required.");    return; }
    if (!formData.project_id)     { setError("Project is required.");     return; }
    try {
      const payload: NewTask = {
        name: formData.name.trim(),
        project_id: formData.project_id,
        project_name: formData.project_name,
        description: formData.description || undefined,
        tag_id: formData.tag_id,
        tag_name: formData.tag_name || undefined,
        due_date: formData.due_date || undefined,
      };
      await createTask.mutateAsync(payload);
      navigate({ to: "/projects/tasks" });
    } catch {
      setError("Failed to create task. Please try again.");
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Projects"
        title="Log New Task"
        description="Owner and company come from the task's project — no need to set them here."
        actions={
          <Link to="/projects/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" /> Back to tasks
          </Link>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading options…</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3 max-w-md">
          <p className="text-sm text-muted-foreground">You need a project before you can log a task.</p>
          <Link to="/projects/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all duration-200"
            style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}>
            <Plus className="w-4 h-4" />Create a project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
            {/* Decorative brand strip */}
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${RAINBOW.join(", ")})` }} />

            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg grid place-items-center" style={{ backgroundColor: `${BRAND.blue}1a` }}>
                  <ListTodo className="size-4" style={{ color: BRAND.blue }} />
                </div>
                <h2 className="text-sm font-semibold">Task information</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {formData.name.trim() && formData.project_id ? "Ready to create" : "Name & project required"}
              </span>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5">
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2.5 rounded-lg text-sm">{error}</div>
                )}

                <ColorField icon={ListTodo} label="Task name" color={BRAND.blue} required>
                  <Input className="h-10 bg-background" placeholder="e.g. Draft wireframes"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </ColorField>

                <GroupLabel color={BRAND.purple}>Assignment</GroupLabel>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColorField icon={Briefcase} label="Project" color={BRAND.purple} required>
                    <SearchableSelect
                      options={projects.map((p) => ({ label: p.project_name, value: String(p.id) }))}
                      value={formData.project_id ? String(formData.project_id) : ""}
                      onValueChange={handleProjectChange}
                      placeholder="Select project"
                      searchPlaceholder="Search projects…"
                    />
                  </ColorField>

                  <ColorField icon={TagIcon} label="Tag" color={BRAND.orange}>
                    <div className="relative">
                      <SelectWithAdd addLabel="tag" onAdd={() => setAddTagOpen(true)}>
                        <SearchableSelect
                          options={tags.map((t) => ({ label: t.name, value: String(t.id) }))}
                          value={formData.tag_id ? String(formData.tag_id) : ""}
                          onValueChange={handleTagChange}
                          placeholder="Select tag"
                          searchPlaceholder="Search tags…"
                        />
                      </SelectWithAdd>
                      {addTagOpen && (
                        <AddTagPopover
                          onAdd={(id, name) => setFormData((p) => ({ ...p, tag_id: id, tag_name: name }))}
                          onClose={() => setAddTagOpen(false)}
                        />
                      )}
                    </div>
                  </ColorField>
                </div>

                <GroupLabel color={BRAND.coral}>Timeline</GroupLabel>

                <ColorField icon={CalendarDays} label="Due date" color={BRAND.coral}>
                  <Input type="date" className="h-10 bg-background"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                </ColorField>

                <GroupLabel color={BRAND.navy}>Details</GroupLabel>

                <ColorField icon={FileText} label="Description" color={BRAND.navy}>
                  <textarea rows={4} value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What needs to be done?"
                    className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all" />
                </ColorField>
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
                <Button type="button" variant="ghost" size="sm" onClick={() => window.history.back()}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createTask.isPending}
                  style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`, border: "none" }}
                  className="text-white hover:opacity-90 transition-opacity disabled:opacity-40">
                  {createTask.isPending
                    ? <><Loader2 className="size-3.5 animate-spin" />Saving…</>
                    : <><CheckCircle2 className="size-3.5" />Create task</>}
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
              <ul className="space-y-3">
                {[
                  { icon: Briefcase, text: "A task can only carry one tag at a time, but it's editable later from the task list.", color: BRAND.purple },
                  { icon: TagIcon,   text: "Tasks are queued as pending and loaded into the warehouse by Talend, same as deals.", color: BRAND.orange },
                ].map(({ icon: Icon, text, color }, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="size-6 rounded-md grid place-items-center shrink-0 mt-0.5" style={{ backgroundColor: `${color}1a` }}>
                      <Icon className="size-3" style={{ color }} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}