import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createForm, CharityStackNotConfiguredError, CharityStackApiError } from "@/lib/charitystack";

// Retries the CharityStack create-form call for a fundraiser saved as a
// draft (sync_status = 'draft' or 'error') — this is the "just start
// working the moment you paste the key in" path from the Connectors
// admin page. Idempotent: does nothing if already synced.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: fundraiser } = await supabase.from("fundraisers").select("*").eq("id", id).single();
  if (!fundraiser) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me.role !== "admin" && fundraiser.office_id !== me.assigned_office_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (fundraiser.sync_status === "synced") {
    return NextResponse.json({ fundraiser });
  }

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
      active: fundraiser.approval_status === "approved",
    });

    const { data: updated, error } = await supabase
      .from("fundraisers")
      .update({
        charitystack_form_id: csResponse.formID,
        charitystack_form_url: csResponse.formUrl,
        charitystack_embed_html: csResponse.embedHTML,
        sync_status: "synced",
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ fundraiser: updated });
  } catch (e) {
    const message =
      e instanceof CharityStackNotConfiguredError
        ? e.message
        : e instanceof CharityStackApiError
        ? e.message
        : e instanceof Error
        ? e.message
        : "Unknown error";

    await supabase
      .from("fundraisers")
      .update({ sync_status: "error", sync_error: message, updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
