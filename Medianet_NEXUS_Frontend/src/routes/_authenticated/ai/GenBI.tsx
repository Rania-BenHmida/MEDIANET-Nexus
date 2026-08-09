import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/AppShell";
import { AiChatView } from "@/components/AiChatView";

export const Route = createFileRoute("/_authenticated/ai/GenBI")({
  component: GenBiPage,
});

function GenBiPage() {
  const { t } = useTranslation();

  return (
    <div className="p-8 max-w-3xl mx-auto h-full flex flex-col">
      <PageHeader
        eyebrow={t("nav.intelligence")}
        title={t("ai.title")}
        description={t("ai.intro")}
      />
      <div className="flex-1 min-h-0 bg-card border border-border rounded-xl shadow-[var(--shadow-card)] flex flex-col overflow-hidden">
        <AiChatView />
      </div>
    </div>
  );
}