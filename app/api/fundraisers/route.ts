import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createForm, CharityStackNotConfiguredError, CharityStackApiError } from "@/lib/charitystack";

// Same shape as /api/volunteer/events: open CORS since this only ever
// returns already-public (is_published = true) data, called server-to-
// server by the WordPress plugin.
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ---------- GET: public list, read by the portal's own list page and
// the WordPress plugin (?office=<uuid or name> and/or ?slug=<slug>) ----------
export async function GET(request: NextRequest) {
  const office = request.nextUrl.searchParams.get("office");
  const slug = request.nextUrl.searchParams.get("slug");

  const supabase = await createClient();

  let query = supabase
    .from("fundraisers")
    .select(
      "id, office_id, slug, title, description, form_type, goal, color, header_image, charitystack_form_url, charitystack_embed_html, sync_status, event_date, start_time, end_time, location"
    )
    .eq("is_published", true)
    .eq("sync_status", "synced")
    .order("created_at", { ascending: false });

  if (slug) {
    query = query.eq("slug", slug);
  }

  if (office) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(office);
    if (isUuid) {
      query = query.eq("office_id", office);
    } else {
      const { data: officeRow } = await supabase
        .from("b2s_offices")
        .select("id")
        .ilike("field_office", office)
        .single();

      if (!officeRow) {
        return NextResponse.json({ fundraisers: [] }, { headers: corsHeaders() });
      }
      query = query.eq("office_id", officeRow.id);
    }
  }

  const { data: fundraisers, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  // Attach live-ish raised totals from the aggregate view (no PII, just
  // dollar sums — safe to expose alongside the rest of this public data).
  const ids = (fundraisers ?? []).map((f) => f.id);
  const { data: totals } = await supabase
    .from("fundraiser_totals")
    .select("fundraiser_id, raised_amount, donation_count")
    .in("fundraiser_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const totalsMap = new Map((totals ?? []).map((t) => [t.fundraiser_id, t]));

  const result = (fundraisers ?? []).map((f) => ({
    ...f,
    raised_amount: totalsMap.get(f.id)?.raised_amount ?? 0,
    donation_count: totalsMap.get(f.id)?.donation_count ?? 0,
  }));

  return NextResponse.json({ fundraisers: result }, { headers: corsHeaders() });
}

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "fundraiser"}-${suffix}`;
}

function isValidClientSlug(slug: string) {
  // Same shape slugify() produces - lowercase, hyphenated, no leading/trailing hyphen.
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 200;
}

// ---------- POST: staff-authenticated create. Always saves the portal-side
// record; only calls out to CharityStack if a key is configured — see the
// draft/synced/error sync_status states in the migration. ----------
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const office_id = body.office_id ?? me.assigned_office_id;
  if (!office_id) {
    return NextResponse.json({ error: "office_id is required" }, { status: 400 });
  }
  if (me.role !== "admin" && office_id !== me.assigned_office_id) {
    return NextResponse.json({ error: "Can only create fundraisers for your own office" }, { status: 403 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!Array.isArray(body.funds) || body.funds.length === 0) {
    return NextResponse.json({ error: "At least one fund is required" }, { status: 400 });
  }

  const slug = body.slug && isValidClientSlug(body.slug) ? body.slug : slugify(body.title);

  const record: Record<string, unknown> = {
    office_id,
    employee_id: me.id,
    slug,
    title: body.title.trim(),
    description: body.description || null,
    form_type: body.form_type ?? "fundraising",
    amount_type: body.amount_type ?? "standard",
    funds: body.funds,
    frequencies: body.frequencies ?? ["ONE_TIME"],
    color: body.color ?? "#10B981",
    header_image: body.header_image || null,
    goal: body.goal ?? null,
    event_date: body.event_date || null,
    start_time: body.start_time || null,
    end_time: body.end_time || null,
    location: body.location || null,
    is_published: false,
    sync_status: "draft",
  };

  // Attempt the live CharityStack call. If no key is configured yet, or
  // the call fails, we still save the draft — see admin/connectors for
  // where the key gets dropped in later, at which point this fundraiser
  // can be re-synced (PATCH .../sync) without re-entering anything.
  try {
    const csResponse = await createForm({
      title: record.title as string,
      funds: record.funds as string[],
      formType: record.form_type as "fundraising" | "event",
      amountType: record.amount_type as "standard" | "giving_level" | "sponsorship",
      frequencies: record.frequencies as string[],
      color: record.color as string,
      description: (record.description as string) ?? undefined,
      headerImage: (record.header_image as string) ?? undefined,
      enableFundraisingBar: !!record.goal,
      goal: (record.goal as number) ?? undefined,
      givingLevels: body.giving_levels ?? undefined,
      sponsorshipGroups: body.sponsorship_groups ?? undefined,
      tickets: body.tickets ?? undefined,
      enableTimeAndLocation: !!record.event_date,
      eventDate: (record.event_date as string) ?? undefined,
      startTime: (record.start_time as string) ?? undefined,
      endTime: (record.end_time as string) ?? undefined,
      location: (record.location as string) ?? undefined,
      active: false, // stays inactive on CharityStack's side until a CIO approves
    });

    record.charitystack_form_id = csResponse.formID;
    record.charitystack_form_url = csResponse.formUrl;
    record.charitystack_embed_html = csResponse.embedHTML;
    record.sync_status = "synced";
  } catch (e) {
    if (e instanceof CharityStackNotConfiguredError) {
      record.sync_status = "draft";
      record.sync_error = null;
    } else if (e instanceof CharityStackApiError) {
      record.sync_status = "error";
      record.sync_error = e.message;
    } else {
      record.sync_status = "error";
      record.sync_error = e instanceof Error ? e.message : "Unknown error creating CharityStack form";
    }
  }

  let { data, error: insertError } = await supabase
    .from("fundraisers")
    .insert(record)
    .select("id, sync_status, sync_error")
    .single();

  // Extremely unlikely (slug includes a random suffix), but if the
  // client-predicted slug did collide with something created in the
  // meantime, retry once with a freshly generated one rather than
  // failing the whole submission.
  if (insertError?.code === "23505" && insertError.message.includes("slug")) {
    record.slug = slugify(record.title as string);
    ({ data, error: insertError } = await supabase
      .from("fundraisers")
      .insert(record)
      .select("id, sync_status, sync_error")
      .single());
  }

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ fundraiser: data });
}
