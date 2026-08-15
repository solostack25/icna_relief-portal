import { getIntegrationSetting } from "@/lib/integrationSettings";

// Pexels, not Unsplash - deliberately. Pexels' free API key works
// immediately at 200 requests/hour with no review process; Unsplash
// caps unreviewed apps at 50/hour and requires submitting screenshots
// for a "Request Approval" review to go higher - the same kind of
// vendor-gating friction this portal's been avoiding elsewhere (ADP,
// Canva Enterprise, Photoshop API).
export type StockPhoto = { id: string; thumbUrl: string; fullUrl: string; photographer: string; pexelsUrl: string };

export async function searchStockPhotos(query: string): Promise<StockPhoto[]> {
  const apiKey = await getIntegrationSetting("pexels_api_key", process.env.PEXELS_API_KEY);
  if (!apiKey) {
    throw new Error("Stock photos aren't configured yet - set the Pexels API key in Admin Portal → Stock Photos.");
  }

  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=24`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`Pexels search failed: ${res.status}`);
  }
  const body = await res.json();
  return (body.photos ?? []).map((p: any) => ({
    id: String(p.id),
    thumbUrl: p.src.medium,
    fullUrl: p.src.large2x,
    photographer: p.photographer,
    pexelsUrl: p.url,
  }));
}
