import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTemporaryImageLink } from "@/lib/dropbox";

// Open to any authenticated employee - both the Flier Builder (marketing
// picking a locked image) and the field-office fill screen (swapping an
// editable image) need to resolve approved images into displayable URLs.
// Approval itself (which images are in this list at all) stays
// marketing/admin-only, enforced by RLS on approved_flier_images -
// this route only ever reads the already-approved set.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: images } = await supabase
    .from("approved_flier_images")
    .select("id, dropbox_path, display_name")
    .eq("is_active", true)
    .order("approved_at", { ascending: false });

  const withLinks = await Promise.all(
    (images ?? []).map(async (img) => {
      try {
        const link = await getTemporaryImageLink(img.dropbox_path);
        return { ...img, link };
      } catch {
        return { ...img, link: null };
      }
    })
  );

  return NextResponse.json({ images: withLinks.filter((i) => i.link) });
}
