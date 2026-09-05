import { getIntegrationSetting } from "@/lib/integrationSettings";

const GRAPH_VERSION = "v21.0";

export type FacebookPost = {
  id: string;
  message: string | null;
  createdAt: string;
  permalink: string;
  imageUrl: string | null;
};

export type InstagramMedia = {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  permalink: string;
  timestamp: string;
};

// Both Facebook and Instagram run through the same Meta Graph API and the
// same Page access token (Instagram Business/Creator accounts inherit
// permissions from the Facebook Page they're linked to) - see
// lib/social/README or the Connectors page description for the setup
// this depends on. For reading a page/account's OWN content, Meta's
// "Development Mode" (the app added as admin/tester on the Page) is
// enough - no public App Review needed, since this never accesses
// anyone else's data.

export async function getFacebookPosts(limit = 12): Promise<FacebookPost[]> {
  const pageId = await getIntegrationSetting("facebook_page_id");
  const token = await getIntegrationSetting("facebook_page_access_token");
  if (!pageId || !token) {
    throw new Error("Facebook isn't configured yet. Set the Page ID and access token in Admin > Connectors.");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/posts?fields=message,created_time,permalink_url,full_picture&limit=${limit}&access_token=${token}`
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? "Facebook post list failed.");

  return (body.data ?? []).map((post: any) => ({
    id: post.id,
    message: post.message ?? null,
    createdAt: post.created_time,
    permalink: post.permalink_url,
    imageUrl: post.full_picture ?? null,
  }));
}

export async function getInstagramMedia(limit = 12): Promise<InstagramMedia[]> {
  const igUserId = await getIntegrationSetting("instagram_business_account_id");
  const token = await getIntegrationSetting("facebook_page_access_token");
  if (!igUserId || !token) {
    throw new Error("Instagram isn't configured yet. Set the Business Account ID in Admin > Connectors (uses the same Facebook access token).");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media?fields=caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${limit}&access_token=${token}`
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? "Instagram media list failed.");

  return (body.data ?? []).map((m: any) => ({
    id: m.id,
    caption: m.caption ?? null,
    mediaType: m.media_type,
    mediaUrl: m.media_url,
    thumbnailUrl: m.thumbnail_url ?? null,
    permalink: m.permalink,
    timestamp: m.timestamp,
  }));
}
