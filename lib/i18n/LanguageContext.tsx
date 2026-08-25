"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { TRANSLATIONS, RTL_LOCALES, type Locale } from "./translations";

const STORAGE_KEY = "icna_portal_lang";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  dir: "ltr" | "rtl";
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLocale(value: string): value is Locale {
  return value === "en" || value === "es" || value === "fa" || value === "ar" || value === "ps";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored)) {
      setLocaleState(stored);
      return;
    }
    // Best-effort default from the browser's language, otherwise English.
    const browserLang = navigator.language.slice(0, 2);
    if (isLocale(browserLang)) setLocaleState(browserLang);
  }, []);

  useEffect(() => {
    const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale]);

  function setLocale(l: Locale) {
    setLocaleState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
  }

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

  const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider value={{ locale, setLocale, dir, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
