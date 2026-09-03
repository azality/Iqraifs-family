// LanguageDropdown — small EN/UR switcher.
// Selecting a language persists to localStorage and reloads the page so RTL
// flips cleanly and every translated string re-renders.

import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";
import { getCurrentLang, setCurrentLang, type Lang } from "../../i18n";
import { persistLangToAccount } from "../../i18n/accountLang";

export function LanguageDropdown() {
  const { t } = useTranslation();
  const cur = getCurrentLang();

  const choose = async (lang: Lang): Promise<void> => {
    if (lang === cur) return;
    setCurrentLang(lang);
    // Also remember on the account so the choice follows the user to
    // their next login / another device (fire-safe: no-op when logged out).
    await persistLangToAccount(lang);
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Globe className="h-4 w-4" />
          {cur === "ur" ? "اردو" : "EN"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => choose("en")}>
          {t("lang.english")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose("ur")}>
          {t("lang.urdu")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
