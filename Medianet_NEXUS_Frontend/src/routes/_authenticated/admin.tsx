import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, ROLE_LABELS, type AppRole } from "@/lib/roles";
import { getAllUsersWithRoles, assignRole, revokeRole, deleteUser } from "@/lib/user-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, Mail, UserPlus, Users, Loader2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

// Same brand palette as Reports/Projects/Customers/Deals.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};

type Row = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string | null;
  roles: AppRole[];
};

const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function initialsOf(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function AdminPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Record<string, AppRole | undefined>>({});

  const refresh = async () => {
    try {
      const data = await getAllUsersWithRoles();
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess("roles", roles)) return;
    void refresh();
  }, [roles]);

  if (!canAccess("roles", roles)) return <Navigate to="/unauthorized" />;

  const handleAssign = async (userId: string) => {
    const role = selectedRole[userId];
    if (!role) return;
    setPendingUserId(userId);
    try {
      await assignRole({ data: { userId, role } });
      toast.success(`${ROLE_LABELS[role]} assigned — they'll get an email confirming access.`);
      await refresh();
      setSelectedRole((prev) => ({ ...prev, [userId]: undefined }));
    } catch {
      toast.error("Failed to assign role");
    } finally {
      setPendingUserId(null);
    }
  };

  const handleRevoke = async (userId: string, role: AppRole) => {
    setPendingUserId(userId);
    try {
      await revokeRole({ data: { userId, role } });
      await refresh();
    } catch {
      toast.error("Failed to revoke role");
    } finally {
      setPendingUserId(null);
    }
  };

  const handleDelete = async (userId: string, label: string) => {
    if (!confirm(`Delete ${label}? This permanently removes their account, roles, and login — this can't be undone.`)) {
      return;
    }
    setPendingUserId(userId);
    try {
      await deleteUser({ data: { userId } });
      toast.success(`${label} deleted.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setPendingUserId(null);
    }
  };

  // New joiners = zero roles yet — these are the accounts IT specialists
  // actually need to act on. Split out and shown first, newest first, so
  // they don't get lost in a long list of already-configured users.
  const { pending, assigned } = useMemo(() => {
    const pending = rows
      .filter((r) => r.roles.length === 0)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    const assigned = rows.filter((r) => r.roles.length > 0);
    return { pending, assigned };
  }, [rows]);

  const renderRoleCell = (r: Row) => {
    const availableRoles = ALL_ROLES.filter((role) => !r.roles.includes(role));
    const isPending = pendingUserId === r.user_id;
    if (availableRoles.length === 0) {
      return <span className="text-xs text-muted-foreground">All roles assigned</span>;
    }
    return (
      <div className="flex items-center gap-2">
        <Select
          value={selectedRole[r.user_id] ?? ""}
          onValueChange={(value) => setSelectedRole((prev) => ({ ...prev, [r.user_id]: value as AppRole }))}
          disabled={isPending}
        >
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[160px] bg-background">
            <SelectValue placeholder="Select role…" />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map((role) => (
              <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={isPending || !selectedRole[r.user_id]}
          onClick={() => handleAssign(r.user_id)}
          aria-label="Assign role"
          style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`, border: "none" }}
          className="h-8 px-2.5 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        </Button>
      </div>
    );
  };

  const renderDeleteCell = (r: Row) => {
    const isSuperadmin = r.roles.includes("superadmin");
    const isPending = pendingUserId === r.user_id;
    if (isSuperadmin) {
      return (
        <span title="Superadmin accounts can't be deleted" className="inline-flex size-7 items-center justify-center text-muted-foreground/30">
          <Trash2 className="size-3.5" />
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleDelete(r.user_id, r.display_name || r.email || "this user")}
        title="Delete user"
        aria-label="Delete user"
        className="size-7 rounded-md grid place-items-center text-muted-foreground opacity-0 group-hover:opacity-100 focus-within:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("admin.eyebrow")}
        title={t("admin.title")}
        description={t("admin.description")}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /><span className="text-sm">{t("common.loading")}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] py-24 text-center text-sm text-muted-foreground">
          {t("admin.noUsers")}
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── New joiners — pending a role ─────────────────────────────── */}
          {pending.length > 0 && (
            <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden border-t-4" style={{ borderTopColor: BRAND.coral }}>
              <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-border">
                <div className="size-8 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${BRAND.coral}1a` }}>
                  <UserPlus className="size-4" style={{ color: BRAND.coral }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">New joiners — awaiting a role</h3>
                  <p className="text-xs text-muted-foreground">These accounts can't access anything until you assign a role.</p>
                </div>
                <Badge className="ml-auto" style={{ backgroundColor: `${BRAND.coral}1a`, color: BRAND.coral, border: "none" }}>
                  {pending.length}
                </Badge>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">User</th>
                    <th className="text-left px-5 py-3 font-medium">
                      <Mail className="inline size-3 mr-1" style={{ color: BRAND.blue, opacity: 0.75 }} />Email
                    </th>
                    <th className="text-left px-5 py-3 font-medium">
                      <Clock className="inline size-3 mr-1" style={{ color: BRAND.orange, opacity: 0.75 }} />Signed up
                    </th>
                    <th className="text-left px-5 py-3 font-medium w-72">Assign role</th>
                    <th className="px-3 py-3 w-14" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pending.map((r) => (
                    <tr key={r.user_id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-full grid place-items-center text-[11px] font-semibold shrink-0"
                            style={{ backgroundColor: `${BRAND.coral}1a`, color: BRAND.coral }}>
                            {initialsOf(r.display_name, r.email)}
                          </div>
                          <div>
                            <p className="font-medium">{r.display_name ?? "Unnamed"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{r.user_id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {r.email ? (
                          <a
                            href={`mailto:${r.email}`}
                            title="Email this person"
                            className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
                          >
                            <Mail className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: BRAND.blue }} />
                            {r.email}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-5 py-3.5 align-top">{renderRoleCell(r)}</td>
                      <td className="px-3 py-3.5 align-top">{renderDeleteCell(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Everyone else ─────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-border">
              <div className="size-8 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${BRAND.blue}1a` }}>
                <Users className="size-4" style={{ color: BRAND.blue }} />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">All users</h3>
            </div>
            {assigned.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No users with a role assigned yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">{t("admin.user")}</th>
                    <th className="text-left px-5 py-3 font-medium">
                      <Mail className="inline size-3 mr-1" style={{ color: BRAND.blue, opacity: 0.75 }} />Email
                    </th>
                    <th className="text-left px-5 py-3 font-medium">{t("admin.roles")}</th>
                    <th className="text-left px-5 py-3 font-medium w-72">Assign role</th>
                    <th className="px-3 py-3 w-14" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assigned.map((r) => (
                    <tr key={r.user_id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-full grid place-items-center text-[11px] font-semibold shrink-0"
                            style={{ backgroundColor: `${BRAND.blue}1a`, color: BRAND.blue }}>
                            {initialsOf(r.display_name, r.email)}
                          </div>
                          <div>
                            <p className="font-medium">{r.display_name ?? "Unnamed"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{r.user_id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {r.email ? (
                          <a
                            href={`mailto:${r.email}`}
                            title="Email this person"
                            className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
                          >
                            <Mail className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: BRAND.blue }} />
                            {r.email}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {r.roles.map((role) => (
                            <Badge key={role} variant="secondary" className="gap-1 pr-1">
                              {ROLE_LABELS[role]}
                              <button
                                type="button"
                                onClick={() => handleRevoke(r.user_id, role)}
                                disabled={pendingUserId === r.user_id}
                                aria-label={`Remove ${ROLE_LABELS[role]} role`}
                                className="rounded-sm hover:bg-destructive/20 hover:text-destructive transition-colors p-0.5 disabled:opacity-50"
                              >
                                <X className="size-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top">{renderRoleCell(r)}</td>
                      <td className="px-3 py-3.5 align-top">{renderDeleteCell(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">{t("admin.footnote")}</p>
    </div>
  );
}