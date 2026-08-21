import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadMedia, WordPressNotConfiguredError, WordPressApiError } from "@/lib/wordpress";

// Hero image upload for the fundraiser builder. Uploads to the WordPress
// media library via the portal's own WP connector credential (see
// admin/connectors) so the resulting URL is permanent and lives on the
// same site the page will be published to. No requester needs their own
// WordPress login for this.
//
// (Previously tried routing this through Dropbox instead, since that's
// where the rest of the portal's images live - but the portal's Dropbox
// app doesn't have the sharing.write scope needed to create shareable
// links, and re-authorizing would mean generating a new refresh token.
// Reverted back to WP media, which was already working.)
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 8MB" }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const media = await uploadMedia(buffer, file.name, file.type);
    return NextResponse.json({ url: media.source_url });
  } catch (e) {
    const message =
      e instanceof WordPressNotConfiguredError
        ? e.message
        : e instanceof WordPressApiError
        ? e.message
        : e instanceof Error
        ? e.message
        : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
