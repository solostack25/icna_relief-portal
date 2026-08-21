import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadFundraiserHeroImage } from "@/lib/dropbox";

// Hero image upload for the fundraiser builder. Uploads to a dedicated
// Dropbox folder (using the portal's shared Dropbox connection - same
// pattern as Content Library / Flier Builder uploads) and returns a
// permanent, hotlinkable share URL. No requester needs their own Dropbox
// or WordPress login for this.
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
    const url = await uploadFundraiserHeroImage(buffer, file.name);
    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
