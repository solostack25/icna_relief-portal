"use client";

import { usePathname } from "next/navigation";
import { getHadithOfTheDay } from "@/lib/hadith";

export default function HadithBanner() {
  const pathname = usePathname();

  // InKind kiosk screens are purpose-built, full-screen touch interfaces
  // (barcode scanning, donor signature capture) — no portal chrome.
  // Scoped to exactly /inkind and its children, not /admin/inkind, which
  // is a normal staff page and should keep the banner like every other
  // program.
  if (pathname === "/inkind" || pathname?.startsWith("/inkind/")) return null;

  const hadith = getHadithOfTheDay();
  const content = `"${hadith.text}" — ${hadith.source}`;

  return (
    <div className="w-full bg-[var(--color-accent)] text-white overflow-hidden py-2">
      <div className="ticker-track whitespace-nowrap">
        <span className="ticker-item text-sm px-8">{content}</span>
        <span className="ticker-item text-sm px-8">{content}</span>
        <span className="ticker-item text-sm px-8">{content}</span>
      </div>
    </div>
  );
}
