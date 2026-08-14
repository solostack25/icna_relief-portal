import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { listImagesInFolder, getTemporaryImageLink } from "@/lib/dropbox";

export async function GET(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { searchParams } = new URL(req.url);
  const folderName = searchParams.get("folder");

  const supabase = await createClient();
  const { data: folders } = await supabase
    .from("content_folders")
    .select("id, name, dropbox_folder_name")
    .eq("is_active", true)
    .order("sort_order");

  if (!folderName) {
    return NextResponse.json({ folders });
  }

  const images = await listImagesInFolder(folderName);
  const withLinks = await Promise.all(
    images.map(async (img) => {
      try {
        const link = await getTemporaryImageLink(img.path);
        return { ...img, link };
      } catch {
        return { ...img, link: null };
      }
    })
  );

  return NextResponse.json({ folders, images: withLinks });
}
