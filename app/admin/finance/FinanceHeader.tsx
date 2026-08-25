"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function FinanceHeader() {
  const { t } = useLanguage();
  return (
    <>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        {t("finance.pageTitle")}
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        {t("finance.pageSubtitle")}
      </p>
    </>
  );
}
