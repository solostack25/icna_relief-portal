"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function LogoutButton() {
  const supabase = createClient();
  const router = useRouter();
  const { t } = useLanguage();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
    >
      {t("chrome.logout")}
    </button>
  );
}
