import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPage, updatePage, buildFundraiserPageContent, WordPressNotConfiguredError, WordPressApiError } from "@/lib/wordpress";

// Creates (or re-generates) the standalone GoFundMe-style WordPress page
// for a fundraiser. Requires the fundraiser to already be synced to
// CharityStack (the page embeds the [icna_fundraiser] shortcode, which
// has nothing to render until charitystack_embed_html exists) and requires
// the WordPress connector to be configured — see admin/connectors.
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

  if (fundraiser.sync_status !== "synced") {
    return NextResponse.json(
      { error: "This fundraiser needs to sync to CharityStack first (see the Sync section above) before a page can be created." },
      { status: 400 }
    );
  }

  const { data: office } = await supabase.from("b2s_offices").select("field_office").eq("id", fundraiser.office_id).single();

  const body = await request.json().catch(() => ({}));
  const organizerName: string | undefined = body.organizer_name;

  const content = buildFundraiserPageContent({
    title: fundraiser.title,
    slug: fundraiser.slug,
    header_image: fundraiser.header_image,
    organizer_name: organizerName ?? me.full_name ?? undefined,
    office_name: office?.field_office ?? undefined,
    story: fundraiser.story,
    description: fundraiser.description,
    updates: fundraiser.updates ?? [],
  });

  try {
    let wpPage;
    if (fundraiser.wp_page_id) {
      wpPage = await updatePage(fundraiser.wp_page_id, { title: fundraiser.title, content });
    } else {
      wpPage = await createPage({ title: fundraiser.title, content, slug: fundraiser.slug, status: "publish" });
    }

    const { data: updated, error } = await supabase
      .from("fundraisers")
      .update({
        wp_page_id: wpPage.id,
        wp_page_url: wpPage.link,
        wp_sync_status: "created",
        wp_sync_error: null,
        is_published: true, // the WP page going live IS the publish action here
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ fundraiser: updated });
  } catch (e) {
    const message =
      e instanceof WordPressNotConfiguredError
        ? e.message
        : e instanceof WordPressApiError
        ? e.message
        : e instanceof Error
        ? e.message
        : "Unknown error creating the WordPress page";

    await supabase
      .from("fundraisers")
      .update({ wp_sync_status: "error", wp_sync_error: message, updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
