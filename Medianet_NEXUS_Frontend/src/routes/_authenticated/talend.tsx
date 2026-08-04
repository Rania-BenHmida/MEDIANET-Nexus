import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/talend")({
  component: TalendPage,
});

function TalendPage() {
  const { roles } = useAuth();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  if (!canAccess("talend", roles)) return <Navigate to="/unauthorized" />;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // TODO: wire up to the actual Talend master job trigger.
      // Placeholder only — no job is triggered yet.
      await new Promise((r) => setTimeout(r, 1200));
      toast.info("Talend refresh isn't wired up yet — this is a placeholder.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow={t("talend.eyebrow")}
        title={t("talend.title")}
        description={t("talend.description")}
      />
      <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-card)] p-8 flex flex-col items-start gap-4">
        <p className="text-sm text-muted-foreground max-w-lg">
          {t("talend.body")}
        </p>
        <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
          {refreshing ? t("talend.refreshing") : t("talend.refreshButton")}
        </Button>
      </div>
    </div>
  );
}