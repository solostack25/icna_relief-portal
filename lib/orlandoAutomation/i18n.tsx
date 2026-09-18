"use client";

import { useLanguage as usePortalLanguage } from "@/lib/i18n/LanguageContext";
import { TRANSLATIONS } from "./translations";

// Houston_Automation shipped its own 5-language dictionary. Rather than
// run a second LanguageProvider (and a second language picker), this
// reuses the portal's locale state - the header's language toggle drives
// both - and only swaps in the Orlando Automation dictionary for lookups.
// Same t()/tn() signatures as Houston_Automation's hook, so ported pages
// didn't need to change their call sites.
export function useLanguage() {
  const { locale, setLocale, dir } = usePortalLanguage();

  function t(key: string, params?: Record<string, string | number>) {
    const dict = TRANSLATIONS[locale];
    let value = dict[key] ?? TRANSLATIONS.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  }

  function tn(baseKey: string, n: number, params?: Record<string, string | number>) {
    const suffix = n === 1 ? "_one" : "_other";
    return t(`${baseKey}${suffix}`, { n, ...params });
  }

  return { locale, setLocale, dir, t, tn };
}
