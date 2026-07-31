import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Open CORS on purpose — this endpoint only ever returns already-public
// (is_published = true) data, and needs to be callable directly from a
// browser if the WordPress plugin is ever switched to client-side fetch
// instead of the server-side proxy.
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const office = request.nextUrl.searchParams.get("office"); // b2s_offices.id (uuid) OR field_office name
  const slug = request.nextUrl.searchParams.get("slug"); // single event lookup

  const supabase = await createClient();

  let query = supabase
    .from("volunteer_events")
    .select(
      "id, office_id, slug, title, description, location_name, location_address, starts_on, ends_on"
    )
    .eq("is_published", true)
    .order("starts_on", { ascending: true });

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
        return NextResponse.json({ events: [] }, { headers: corsHeaders() });
      }
      query = query.eq("office_id", officeRow.id);
    }
  }

  const { data: events, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders() }
    );
  }

  const eventIds = (events ?? []).map((e) => e.id);

  const { data: slots } = await supabase
    .from("volunteer_slots")
    .select("id, event_id, slot_type, label, start_time, end_time, capacity")
    .in("event_id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"]);

  const slotIds = (slots ?? []).map((s) => s.id);

  const { data: availability } = await supabase
    .from("volunteer_slot_availability")
    .select("slot_id, spots_remaining")
    .in("slot_id", slotIds.length ? slotIds : ["00000000-0000-0000-0000-000000000000"]);

  const remainingMap = new Map((availability ?? []).map((a) => [a.slot_id, a.spots_remaining]));

  const slotsByEvent = new Map<string, any[]>();
  for (const s of slots ?? []) {
    const list = slotsByEvent.get(s.event_id) ?? [];
    list.push({ ...s, spots_remaining: remainingMap.get(s.id) ?? s.capacity });
    slotsByEvent.set(s.event_id, list);
  }

  const result = (events ?? []).map((e) => ({
    ...e,
    slots: slotsByEvent.get(e.id) ?? [],
  }));

  return NextResponse.json({ events: result }, { headers: corsHeaders() });
}
