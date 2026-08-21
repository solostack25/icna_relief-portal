import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadMedia, WordPressNotConfiguredError, WordPressApiError } from "@/lib/wordpress";

// Hero image upload for the fundraiser builder. Uploads to the WordPress
// media library via the portal's own WP connector credential (see
// admin/connectors) so the resulting URL is permanent and lives on the
// same site the page will be published to — no requester needs their
// own WordPress login, and this is the only WP-facing action available
// to non-approvers (it never creates or edits a page, just an image).
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
