import { Dropbox } from "dropbox";
import { getIntegrationSetting } from "@/lib/integrationSettings";

// One shared, portal-level connection - not per-employee OAuth. This is
// the whole point: employees never see or touch Dropbox credentials,
// they just pick a category and upload through the portal. Uses a
// long-lived refresh token (Dropbox access tokens expire quickly; the
// SDK handles refreshing automatically when given clientId/clientSecret/
// refreshToken together).
//
// Credentials are DB-first (see /admin/dropbox - an admin can rotate
// these without a code deploy), falling back to the Vercel env vars if
// nothing's been set in the DB yet.
async function getDropboxClient(): Promise<Dropbox> {
  const appKey = await getIntegrationSetting("dropbox_app_key", process.env.DROPBOX_APP_KEY);
  const appSecret = await getIntegrationSetting("dropbox_app_secret", process.env.DROPBOX_APP_SECRET);
  const refreshToken = await getIntegrationSetting("dropbox_refresh_token", process.env.DROPBOX_REFRESH_TOKEN);
  if (!appKey || !appSecret || !refreshToken) {
    throw new Error(
      "Dropbox isn't configured yet - set the App Key, App Secret, and Refresh Token in Admin Portal → Dropbox."
    );
  }
  return new Dropbox({ clientId: appKey, clientSecret: appSecret, refreshToken });
}

// Simple upload API tops out around 150MB - good enough for photos and
// documents, which is what this tool is actually for. Flagged clearly
// rather than silently failing/truncating if someone tries a large
// video; a chunked upload-session flow would need to be added if that
// becomes a real need.
const MAX_SIMPLE_UPLOAD_BYTES = 145 * 1024 * 1024;

export async function uploadContentFile(params: {
  dropboxFolderName: string;
  fileName: string;
  fileBuffer: Buffer;
}): Promise<{ path: string; sizeBytes: number }> {
  if (params.fileBuffer.length > MAX_SIMPLE_UPLOAD_BYTES) {
    throw new Error(
      `File is too large (${Math.round(params.fileBuffer.length / 1024 / 1024)}MB) - files over ~145MB aren't supported yet.`
    );
  }

  const dbx = await getDropboxClient();
  // Dropbox creates any missing parent folders automatically on upload -
  // no separate "create folder first" call needed. autorename avoids
  // silently overwriting a file that already has the same name.
  const path = `/${params.dropboxFolderName}/${params.fileName}`;
  const res = await dbx.filesUpload({
    path,
    contents: params.fileBuffer,
    mode: { ".tag": "add" },
    autorename: true,
  });

  return { path: res.result.path_display ?? path, sizeBytes: params.fileBuffer.length };
}

// ---- Browsing, for the Flier Builder's image-approval picker ----

export type DropboxImageEntry = { path: string; name: string };

// Lists image files (by extension) directly inside a folder - not
// recursive, matches the flat structure Upload Content already creates.
export async function listImagesInFolder(dropboxFolderName: string): Promise<DropboxImageEntry[]> {
  const dbx = await getDropboxClient();
  const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic)$/i;
  try {
    const res = await dbx.filesListFolder({ path: `/${dropboxFolderName}` });
    return res.result.entries
      .filter((e) => e[".tag"] === "file" && IMAGE_EXT.test(e.name))
      .map((e) => ({ path: (e as any).path_display ?? `/${dropboxFolderName}/${e.name}`, name: e.name }));
  } catch {
    // Folder doesn't exist yet (nothing uploaded there) - not an error,
    // just nothing to show.
    return [];
  }
}

// A temporary (short-lived, a few hours) direct-access URL - good enough
// for rendering a thumbnail/preview in the browser without proxying the
// image's binary data through our own server.
export async function getTemporaryImageLink(path: string): Promise<string> {
  const dbx = await getDropboxClient();
  const res = await dbx.filesGetTemporaryLink({ path });
  return res.result.link;
}

// ---- Permanent public links (for hero images embedded on live pages) ----

const FUNDRAISER_HERO_FOLDER = "Fundraiser Hero Images";

function toDirectViewUrl(shareUrl: string): string {
  // Dropbox share links default to a preview/landing page (?dl=0). Swapping
  // in raw=1 returns the actual image bytes, which is what an <img src>
  // or a WordPress page's hero image needs - and unlike filesGetTemporaryLink,
  // this URL doesn't expire, so it's safe to store permanently on a fundraiser.
  const url = new URL(shareUrl);
  url.searchParams.set("raw", "1");
  url.searchParams.delete("dl");
  return url.toString();
}

// Uploads a fundraiser hero image to a dedicated Dropbox folder and
// returns a permanent, hotlinkable URL - used instead of the WordPress
// media library so every image asset for the portal lives in one place
// (Dropbox), consistent with how the rest of the portal's content/flier
// images are already stored.
export async function uploadFundraiserHeroImage(fileBuffer: Buffer, fileName: string): Promise<string> {
  const dbx = await getDropboxClient();
  const path = `/${FUNDRAISER_HERO_FOLDER}/${fileName}`;

  const uploadRes = await dbx.filesUpload({
    path,
    contents: fileBuffer,
    mode: { ".tag": "add" },
    autorename: true,
  });
  const finalPath = uploadRes.result.path_display ?? path;

  try {
    const linkRes = await dbx.sharingCreateSharedLinkWithSettings({ path: finalPath });
    return toDirectViewUrl(linkRes.result.url);
  } catch (err: any) {
    // Dropbox throws shared_link_already_exists if one was already created
    // for this exact path (shouldn't normally happen right after a fresh
    // upload with autorename, but handle it defensively) - fetch the
    // existing link instead of failing the whole upload.
    if (err?.error?.error?.[".tag"] === "shared_link_already_exists") {
      const existing = await dbx.sharingListSharedLinks({ path: finalPath, direct_only: true });
      const link = existing.result.links[0];
      if (link) return toDirectViewUrl(link.url);
    }
    throw err;
  }
}
