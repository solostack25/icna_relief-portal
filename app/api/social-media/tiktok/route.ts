import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (!me) return { ok: false as const, status: 401 as const };
  return { ok: true as const, supabase, employeeId: me.id, role: me.role };
}

export async function GET() {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Not authorized" }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("tiktok_featured_videos")
    .select("id, url, title, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // TikTok's oEmbed endpoint is public (no API key/app needed, unlike
  // their Display API) - enriches each stored link with a real
  // thumbnail/title/author instead of showing a bare URL. Best-effort:
  // a failed lookup just falls back to the stored title (or the URL) so
  // one bad/removed video doesn't break the whole list.
  const videos = await Promise.all(
    (data ?? []).map(async (v) => {
      try {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(v.url)}`);
        if (!res.ok) throw new Error("oEmbed lookup failed");
        const embed = await res.json();
        return {
          ...v,
          title: v.title ?? embed.title ?? null,
          thumbnailUrl: embed.thumbnail_url ?? null,
          authorName: embed.author_name ?? null,
        };
      } catch {
        return { ...v, thumbnailUrl: null, authorName: null };
      }
    })
  );

  return NextResponse.json({ videos });
}

export async function POST(req: Request) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Not authorized" }, { status: auth.status });
  if (auth.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json();

  if (body.remove) {
    const { error } = await auth.supabase.from("tiktok_featured_videos").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.url?.trim()) return NextResponse.json({ error: "A video URL is required." }, { status: 400 });

  const { error } = await auth.supabase.from("tiktok_featured_videos").insert({
    url: body.url.trim(),
    title: body.title?.trim() || null,
    added_by: auth.employeeId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
