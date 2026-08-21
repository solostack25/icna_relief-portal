import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createForm, updateForm, CharityStackNotConfiguredError, CharityStackApiError } from "@/lib/charitystack";
import { createPage, updatePage, buildFundraiserPageContent, WordPressNotConfiguredError, WordPressApiError } from "@/lib/wordpress";

async function requireApprover(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: me } = await supabase
    .from("employees")
    .select("id, full_name, role, is_cio")
    .eq("auth_user_id", user.id)
    .single();
  if (!me || !(me.role === "admin" || me.is_cio)) {
    return { error: NextResponse.json({ error: "Only a designated approver can approve fundraisers" }, { status: 403 }) };
  }
  return { me };
}

// Approving is the single action that takes a fundraiser fully live:
// syncs to CharityStack if it hasn't already, flips the CharityStack
// form active, creates (or regenerates) the standalone WordPress page,
// and marks it published — all server-side, so the requester never
// needs WordPress access of their own.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const result = await requireApprover(supabase);
  if ("error" in result) return result.error;
  const { me } = result;

  const admin = createAdminClient();
  const { data: fundraiser } = await admin.from("fundraisers").select("*").eq("id", id).single();
  if (!fundraiser) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (fundraiser.approval_status === "approved") {
    return NextResponse.json({ fundraiser });
  }

  let charitystackFormId = fundraiser.charitystack_form_id;
  if (fundraiser.sync_status !== "synced") {
    try {
      const csResponse = await createForm({
        title: fundraiser.title,
        funds: fundraiser.funds,
        formType: fundraiser.form_type,
        amountType: fundraiser.amount_type,
        frequencies: fundraiser.frequencies,
        color: fundraiser.color,
        description: fundraiser.description ?? undefined,
        headerImage: fundraiser.header_image ?? undefined,
        enableFundraisingBar: !!fundraiser.goal,
        goal: fundraiser.goal ?? undefined,
        enableTimeAndLocation: !!fundraiser.event_date,
        eventDate: fundraiser.event_date ?? undefined,
        startTime: fundraiser.start_time ?? undefined,
        endTime: fundraiser.end_time ?? undefined,
        location: fundraiser.location ?? undefined,
        active: true,
      });
      charitystackFormId = csResponse.formID;
      await admin
        .from("fundraisers")
        .update({
          charitystack_form_id: csResponse.formID,
          charitystack_form_url: csResponse.formUrl,
          charitystack_embed_html: csResponse.embedHTML,
          sync_status: "synced",
          sync_error: null,
        })
        .eq("id", id);
    } catch (e) {
      const message =
        e instanceof CharityStackNotConfiguredError
          ? e.message
          : e instanceof CharityStackApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Unknown error syncing to CharityStack";
      await admin.from("fundraisers").update({ sync_status: "error", sync_error: message }).eq("id", id);
      return NextResponse.json({ error: `Can't approve — CharityStack sync failed: ${message}` }, { status: 502 });
    }
  } else {
    try {
      await updateForm(charitystackFormId!, { active: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error activating the CharityStack form";
      return NextResponse.json({ error: `Can't approve — failed to activate CharityStack form: ${message}` }, { status: 502 });
    }
  }

  const { data: office } = await admin.from("b2s_offices").select("field_office").eq("id", fundraiser.office_id).single();
  const { data: creator } = await admin.from("employees").select("full_name").eq("id", fundraiser.employee_id).single();

  const content = buildFundraiserPageContent({
    title: fundraiser.title,
    slug: fundraiser.slug,
    header_image: fundraiser.header_image,
    organizer_name: creator?.full_name ?? undefined,
    office_name: office?.field_office ?? undefined,
    story: fundraiser.story,
    description: fundraiser.description,
    updates: fundraiser.updates ?? [],
  });

  let wpPageId = fundraiser.wp_page_id;
  let wpPageUrl = fundraiser.wp_page_url;
  let wpSyncStatus: "created" | "error" = "created";
  let wpSyncError: string | null = null;

  try {
    const wpPage = fundraiser.wp_page_id
      ? await updatePage(fundraiser.wp_page_id, { title: fundraiser.title, content, status: "publish" })
      : await createPage({ title: fundraiser.title, content, slug: fundraiser.slug, status: "publish" });
    wpPageId = wpPage.id;
    wpPageUrl = wpPage.link;
  } catch (e) {
    wpSyncStatus = "error";
    wpSyncError =
      e instanceof WordPressNotConfiguredError
        ? e.message
        : e instanceof WordPressApiError
        ? e.message
        : e instanceof Error
        ? e.message
        : "Unknown error creating the WordPress page";
  }

  const { data: updated, error } = await admin
    .from("fundraisers")
    .update({
      approval_status: "approved",
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
      wp_page_id: wpPageId,
      wp_page_url: wpPageUrl,
      wp_sync_status: wpSyncStatus,
      wp_sync_error: wpSyncError,
      is_published: wpSyncStatus === "created",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (wpSyncStatus === "error") {
    return NextResponse.json(
      { fundraiser: updated, warning: `Approved and CharityStack is live, but the WordPress page failed: ${wpSyncError}. Retry from this page.` },
      { status: 207 }
    );
  }

  return NextResponse.json({ fundraiser: updated });
}
