import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFacebookPosts } from "@/lib/social/meta";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  try {
    const posts = await getFacebookPosts();
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Facebook request failed." }, { status: 500 });
  }
}
