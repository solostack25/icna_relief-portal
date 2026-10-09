import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshPublicWebsite } from "@/lib/publicWebsite";
import { isObject, MAX_SECTION_BYTES, SECTION_KEY } from "@/lib/websiteContent";

// Saves or resets one section of the public website's content (web_content).
// RLS decides who may write: only people on web_content_editors. The checks here just give clearer errors.
// The website validates every value again before showing it, so nothing saved here can break a page.

async function editor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const { data: allowed, error } = await supabase.rpc("is_web_content_editor");
  if (error) {
    return { supabase, error: NextResponse.json({ error: "The website editor isn’t set up in the database yet." }, { status: 503 }) } as const;
  }
  if (allowed !== true) {
    return { supabase, error: NextResponse.json({ error: "You’re not on the website editors list." }, { status: 403 }) } as const;
  }
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  return { supabase, employeeId: (me?.id as string | undefined) ?? null } as const;
}

export async function POST(request: NextRequest) {
  const ctx = await editor();
  if ("error" in ctx && ctx.error) return ctx.error;

  const b = await request.json().catch(() => null);
  const key = typeof b?.key === "string" ? b.key : "";
  if (!SECTION_KEY.test(key)) return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  if (!isObject(b?.value)) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  if (JSON.stringify(b.value).length > MAX_SECTION_BYTES) {
    return NextResponse.json({ error: "This section is too large to save. Shorten the longest text and try again." }, { status: 413 });
  }

  const { data: saved, error } = await ctx.supabase
    .from("web_content")
    .upsert({ key, value: b.value, updated_at: new Date().toISOString(), updated_by: ctx.employeeId }, { onConflict: "key" })
    .select("key, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!saved || saved.length === 0) return NextResponse.json({ error: "You’re not on the website editors list." }, { status: 403 });

  const refreshed = await refreshPublicWebsite();
  return NextResponse.json({ ok: true, refreshed, updated_at: saved[0].updated_at });
}

// Reset: removes the saved section, so the website goes back to its own built-in content.
export async function DELETE(request: NextRequest) {
  const ctx = await editor();
  if ("error" in ctx && ctx.error) return ctx.error;

  const b = await request.json().catch(() => null);
  const key = typeof b?.key === "string" ? b.key : "";
  if (!SECTION_KEY.test(key)) return NextResponse.json({ error: "Unknown section." }, { status: 400 });

  const { error } = await ctx.supabase.from("web_content").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const refreshed = await refreshPublicWebsite();
  return NextResponse.json({ ok: true, refreshed });
}
