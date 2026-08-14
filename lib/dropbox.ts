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
