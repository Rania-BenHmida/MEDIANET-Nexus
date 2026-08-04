import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGS, setLanguage } from "@/lib/i18n";

export function LanguageSwitcher({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const { i18n, t } = useTranslation();
  const current = SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" aria-label={t("common.language")}>
            <Languages className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-2">
            <Languages className="size-4" />
            {current.label}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SUPPORTED_LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLanguage(l.code)}
            className={l.code === current.code ? "font-medium" : ""}
          >
            {l.label}
            {l.code === current.code && <span className="ml-auto text-primary">•</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
