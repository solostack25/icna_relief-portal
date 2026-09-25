// Connection to the public website (icnarelief.org rebuild) for office listings.
// The website reads public.web_offices; after a save we ask it to refresh right away
// instead of waiting for its hourly cache.

import { PUBLIC_WEBSITE_URL } from "./publicWebsiteShared";
export { PUBLIC_WEBSITE_URL, WEBSITE_KINDS, WEBSITE_SERVICES } from "./publicWebsiteShared";

/** Tell the website to refresh office listings now. Never throws; false means "it'll catch up within the hour". */
export async function refreshPublicWebsite(): Promise<boolean> {
  const secret = process.env.OFFICES_REVALIDATE_SECRET;
  if (!secret) return false;
  try {
    const res = await fetch(`${PUBLIC_WEBSITE_URL}/api/revalidate/offices`, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Approximate map point for a ZIP code (ZIP center), from the website's ZIP lookup. */
export async function zipCenter(zip: string): Promise<{ lat: number; lng: number } | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  try {
    const res = await fetch(`${PUBLIC_WEBSITE_URL}/api/zip/${zip}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.lat === "number" && typeof j.lng === "number" ? { lat: j.lat, lng: j.lng } : null;
  } catch {
    return null;
  }
}

