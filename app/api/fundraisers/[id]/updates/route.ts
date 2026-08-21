import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPage, updatePage, buildFundraiserPageContent, WordPressNotConfiguredError, WordPressApiError } from "@/lib/wordpress";

// Posts a dated update to a fundraiser and, if a WordPress page already
// exists for it, regenerates that page's content so the update shows up
// live immediately — same content-builder used by /publish-page, just
// re-run with the new update prepended.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("id, full_name, role, assigned_office_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: fundraiser } = await supabase.from("fundraisers").select("*").eq("id", id).single();
  if (!fundraiser) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me.role !== "admin" && fundraiser.office_id !== me.assigned_office_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const message: string = (body.message || "").trim();
  if (!message) return NextResponse.json({ error: "Update message is required" }, { status: 400 });

  const newUpdate = { id: crypto.randomUUID(), posted_at: new Date().toISOString(), message };
  const updates = [newUpdate, ...(fundraiser.updates ?? [])];

  const { data: saved, error: saveError } = await supabase
    .from("fundraisers")
    .update({ updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  if (!saved.wp_page_id) {
    // No page yet to regenerate — the update is saved and will show up
    // whenever the page is first created.
    return NextResponse.json({ fundraiser: saved });
  }

  const { data: office } = await supabase.from("b2s_offices").select("field_office").eq("id", saved.office_id).single();

  const content = buildFundraiserPageContent({
    title: saved.title,
    slug: saved.slug,
    header_image: saved.header_image,
    organizer_name: me.full_name ?? undefined,
    office_name: office?.field_office ?? undefined,
    story: saved.story,
    description: saved.description,
    updates: saved.updates ?? [],
  });

  try {
    const wpPage = await updatePage(saved.wp_page_id, { content });
    return NextResponse.json({ fundraiser: saved, wp_page_url: wpPage.link });
  } catch (e) {
    const message =
      e instanceof WordPressNotConfiguredError
        ? e.message
        : e instanceof WordPressApiError
        ? e.message
        : e instanceof Error
        ? e.message
        : "Unknown error updating the WordPress page";
    // Update is still saved in the DB even if the page push failed —
    // just surface the error so staff know to retry.
    return NextResponse.json({ fundraiser: saved, wp_error: message }, { status: 207 });
  }
}
