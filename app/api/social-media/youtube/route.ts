import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getYouTubeUploads } from "@/lib/social/youtube";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  try {
    const videos = await getYouTubeUploads();
    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "YouTube request failed." }, { status: 500 });
  }
}
