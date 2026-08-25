export type Locale = "en" | "es" | "fa" | "ar" | "ps";

export const LOCALES: { code: Locale; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "fa", label: "دری", dir: "rtl" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ps", label: "پښتو", dir: "rtl" },
];

export const RTL_LOCALES: Locale[] = ["fa", "ar", "ps"];

// Locale codes used for Intl date/number formatting.
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-US",
  es: "es",
  fa: "fa",
  ar: "ar",
  ps: "ps",
};

type Dict = Record<string, string>;

// ------------------------------------------------------------------
// Keys are namespaced by area, e.g. "chrome.logout", "selectApp.title".
// Add new keys here as each page gets converted.
// ------------------------------------------------------------------

const en: Dict = {
  // Shared chrome (PortalHeader, AdminSidebar, etc.)
  "chrome.logout": "Log out",
  "chrome.back": "Back",
};

const es: Dict = {
  "chrome.logout": "Cerrar sesión",
  "chrome.back": "Atrás",
};

const fa: Dict = {
  "chrome.logout": "خروج",
  "chrome.back": "بازگشت",
};

const ar: Dict = {
  "chrome.logout": "تسجيل الخروج",
  "chrome.back": "رجوع",
};

const ps: Dict = {
  "chrome.logout": "وتل",
  "chrome.back": "شاته",
};

export const TRANSLATIONS: Record<Locale, Dict> = { en, es, fa, ar, ps };
