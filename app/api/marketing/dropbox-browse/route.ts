import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { listImagesInFolder, getTemporaryImageLink } from "@/lib/dropbox";

export async function GET(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { searchParams } = new URL(req.url);
  const folderName = searchParams.get("folder");
  const wantAll = searchParams.get("all") === "true";

  const supabase = await createClient();
  const { data: folders } = await supabase
    .from("content_folders")
    .select("id, name, dropbox_folder_name")
    .eq("is_active", true)
    .order("sort_order");

  if (!folderName && !wantAll) {
    return NextResponse.json({ folders });
  }

  async function loadFolderImages(dropboxFolderName: string) {
    const images = await listImagesInFolder(dropboxFolderName);
    return Promise.all(
      images.map(async (img) => {
        try {
          const link = await getTemporaryImageLink(img.path);
          return { ...img, link };
        } catch {
          return { ...img, link: null };
        }
      })
    );
  }

  if (wantAll) {
    const results = await Promise.all(
      (folders ?? []).map(async (f) => ({
        folderId: f.id,
        folderName: f.name,
        images: await loadFolderImages(f.dropbox_folder_name).catch(() => []),
      }))
    );
    return NextResponse.json({ folders, results });
  }

  const withLinks = await loadFolderImages(folderName!);
  return NextResponse.json({ folders, images: withLinks });
}
