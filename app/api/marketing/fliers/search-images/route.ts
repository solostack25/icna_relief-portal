import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { listImagesInFolder, getTemporaryImageLink } from "@/lib/dropbox";

// Deliberately searches only the approved Content Library (Dropbox
// folders already vetted by marketing) rather than a live web/stock
// search - this is what keeps a programmatically-assembled flier from
// ever using an unapproved or off-brand image. If nothing matches,
// callers should surface "no approved image found" rather than
// falling back to an unvetted source.
export async function GET(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase().trim();
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: folders } = await supabase
    .from("content_folders")
    .select("name, dropbox_folder_name")
    .eq("is_active", true);

  const allImages = (
    await Promise.all(
      (folders ?? []).map(async (f: { name: string; dropbox_folder_name: string }) => {
        try {
          const images = await listImagesInFolder(f.dropbox_folder_name);
          return images.map((img) => ({ ...img, folderName: f.name }));
        } catch {
          return [];
        }
      })
    )
  ).flat();

  const matches = allImages.filter((img) => img.name.toLowerCase().includes(query) || img.folderName.toLowerCase().includes(query));

  const withLinks = await Promise.all(
    matches.slice(0, 10).map(async (img) => {
      try {
        const link = await getTemporaryImageLink(img.path);
        return { path: img.path, name: img.name, folderName: img.folderName, link };
      } catch {
        return { path: img.path, name: img.name, folderName: img.folderName, link: null };
      }
    })
  );

  return NextResponse.json({ images: withLinks.filter((i) => i.link) });
}
