"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LOCALES } from "@/lib/i18n/translations";

export default function LanguageToggle() {
  const { locale, setLocale } = useLanguage();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as typeof locale)}
      aria-label="Language / Idioma / زبان / اللغة / ژبه"
      className="text-xs rounded-lg border px-2 py-1.5 outline-none"
      style={{ borderColor: "var(--portal-line)", background: "#fff", color: "rgba(22,48,43,0.75)" }}
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
