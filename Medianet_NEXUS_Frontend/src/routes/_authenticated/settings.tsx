import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, roles } = useAuth();
  const { t } = useTranslation();
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <PageHeader eyebrow={t("settings.eyebrow")} title={t("settings.title")} description={t("settings.description")} />
      <div className="bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-card)] space-y-5">
        <Field label={t("settings.displayName")} value={profile?.displayName ?? "—"} />
        <Field label={t("settings.email")} value={user?.email ?? "—"} />
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t("settings.roles")}</p>
          <div className="flex flex-wrap gap-1.5">
            {roles.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t("settings.noRole")}</span>
            ) : (
              roles.map((r) => <Badge key={r}>{ROLE_LABELS[r]}</Badge>)
            )}
          </div>
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("settings.language")}</p>
          <p className="text-sm text-muted-foreground mb-3">{t("settings.languageDesc")}</p>
          <LanguageSwitcher variant="full" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm mt-1">{value}</p>
    </div>
  );
}