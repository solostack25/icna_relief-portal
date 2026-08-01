// Curated Hadith of the Day — charity and renewing intention only.
// Every entry here is Sahih (authenticated) per Sahih al-Bukhari and/or
// Sahih Muslim, verified against sunnah.com and standard hadith
// references before inclusion. Do not add entries without verifying
// authenticity and exact citation first.

export type Hadith = {
  text: string;
  source: string;
};

export const HADITHS: Hadith[] = [
  {
    text: "Actions are judged by intentions, and every person will get what he intended.",
    source: "Sahih al-Bukhari 1, Sahih Muslim 1907",
  },
  {
    text: "Charity does not decrease wealth.",
    source: "Sahih Muslim 2588",
  },
  {
    text: "Every good deed is charity.",
    source: "Sahih al-Bukhari & Sahih Muslim (agreed upon)",
  },
  {
    text: "When a person dies, his deeds come to an end except for three: an ongoing charity, beneficial knowledge, or a righteous child who prays for him.",
    source: "Sahih Muslim 1631",
  },
];

export function getHadithOfTheDay(): Hadith {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  return HADITHS[dayOfYear % HADITHS.length];
}
