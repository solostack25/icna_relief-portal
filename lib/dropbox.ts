import { Dropbox } from "dropbox";

// One shared, portal-level connection - not per-employee OAuth. This is
// the whole point: employees never see or touch Dropbox credentials,
// they just pick a category and upload through the portal. Uses a
// long-lived refresh token (Dropbox access tokens expire quickly; the
// SDK handles refreshing automatically when given clientId/clientSecret/
// refreshToken together).
function getDropboxClient(): Dropbox {
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  if (!appKey || !appSecret || !refreshToken) {
    throw new Error(
      "Dropbox isn't configured yet - DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN need to be set."
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

  const dbx = getDropboxClient();
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
