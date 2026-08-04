import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, ROLE_LABELS, type AppRole } from "@/lib/roles";
import { getAllUsersWithRoles, assignRole, revokeRole } from "@/lib/user-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Row = {
  user_id: string;
  display_name: string | null;
  roles: AppRole[];
};

const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

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

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("admin.eyebrow")}
        title={t("admin.title")}
        description={t("admin.description")}
      />
      <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-5 py-3 font-medium">{t("admin.user")}</th>
              <th className="text-left px-5 py-3 font-medium">{t("admin.roles")}</th>
              <th className="text-left px-5 py-3 font-medium w-64">Assign role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
                  {t("admin.noUsers")}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const availableRoles = ALL_ROLES.filter((role) => !r.roles.includes(role));
              const isPending = pendingUserId === r.user_id;
              return (
                <tr key={r.user_id}>
                  <td className="px-5 py-3 align-top">
                    <p className="font-medium">{r.display_name ?? "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{r.user_id.slice(0, 8)}</p>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {r.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">{t("common.noRole")}</span>
                      ) : (
                        r.roles.map((role) => (
                          <Badge key={role} variant="secondary" className="gap-1 pr-1">
                            {ROLE_LABELS[role]}
                            <button
                              type="button"
                              onClick={() => handleRevoke(r.user_id, role)}
                              disabled={isPending}
                              aria-label={`Remove ${ROLE_LABELS[role]} role`}
                              className="rounded-sm hover:bg-destructive/20 hover:text-destructive transition-colors p-0.5 disabled:opacity-50"
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 align-top">
                    {availableRoles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">All roles assigned</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedRole[r.user_id] ?? ""}
                          onValueChange={(value) =>
                            setSelectedRole((prev) => ({ ...prev, [r.user_id]: value as AppRole }))
                          }
                          disabled={isPending}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="Select role…" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          disabled={isPending || !selectedRole[r.user_id]}
                          onClick={() => handleAssign(r.user_id)}
                          aria-label="Add role"
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t("admin.footnote")}</p>
    </div>
  );
}