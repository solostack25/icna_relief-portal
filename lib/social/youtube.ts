import { getIntegrationSetting } from "@/lib/integrationSettings";

export type YouTubeVideo = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  url: string;
};

// Public YouTube Data API v3 - just an API key, no OAuth, since a
// channel's own upload list is public data. Uses the "uploads" playlist
// (every channel has one, auto-populated with everything it publishes)
// via playlistItems.list rather than search.list, which costs 100x less
// quota for the same result (1 unit vs 100 units per call).
export async function getYouTubeUploads(maxResults = 12): Promise<YouTubeVideo[]> {
  const apiKey = await getIntegrationSetting("youtube_api_key");
  const channelId = await getIntegrationSetting("youtube_channel_id");
  if (!apiKey || !channelId) {
    throw new Error("YouTube isn't configured yet. Set the API key and channel ID in Admin > Connectors.");
  }

  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${apiKey}`
  );
  const channelBody = await channelRes.json();
  if (!channelRes.ok) throw new Error(channelBody.error?.message ?? "YouTube channel lookup failed.");
  const uploadsPlaylistId = channelBody.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Couldn't find an uploads playlist for that channel ID - double check it in Admin > Connectors.");

  const itemsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`
  );
  const itemsBody = await itemsRes.json();
  if (!itemsRes.ok) throw new Error(itemsBody.error?.message ?? "YouTube video list failed.");

  return (itemsBody.items ?? []).map((item: any) => ({
    id: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
    publishedAt: item.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
  }));
}
