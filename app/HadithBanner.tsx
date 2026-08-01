import { getHadithOfTheDay } from "@/lib/hadith";

export default function HadithBanner() {
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
