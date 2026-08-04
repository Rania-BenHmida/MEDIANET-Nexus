import { Search, Bell, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function TopBar({ onOpenAi }: { onOpenAi: () => void }) {
  const { t } = useTranslation();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <header className="h-16 shrink-0 border-b border-border bg-background flex items-center justify-between px-6 gap-6">
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={t("common.searchPlaceholder")}
            className="w-full bg-muted/60 border border-transparent focus:border-border focus:bg-background rounded-full pl-10 pr-16 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 bg-background">
            ⌘K
          </kbd>
        </div>
      </div>
      <div className="flex items-center gap-2">
        
        <LanguageSwitcher />
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive border-2 border-background" />
        </Button>
        <Button onClick={onOpenAi} size="sm" className="gap-2">
          {t("common.askAi")}
        </Button>
      </div>
    </header>
  );
}
