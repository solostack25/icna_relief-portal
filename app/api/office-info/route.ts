import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Same shape as /api/volunteer/events and /api/fundraisers: open CORS,
// public data only, called server-to-server by the WordPress plugin.
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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function GET(request: NextRequest) {
  const office = request.nextUrl.searchParams.get("office"); // b2s_offices.id (uuid) OR field_office name

  if (!office) {
    return NextResponse.json({ error: "office or office_id is required" }, { status: 400, headers: corsHeaders() });
  }

  const supabase = await createClient();

  let officeId = office;
  const isUuid = /^[0-9a-f-]{36}$/i.test(office);
  if (!isUuid) {
    const { data: officeRow } = await supabase.from("b2s_offices").select("id").ilike("field_office", office).single();
    if (!officeRow) {
      return NextResponse.json({ office_hours: [], notes: [] }, { headers: corsHeaders() });
    }
    officeId = officeRow.id;
  }

  const [{ data: hoursRows }, { data: notesRows }] = await Promise.all([
    supabase
      .from("office_hours")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("office_id", officeId)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("office_info_notes")
      .select("id, label, content")
      .eq("office_id", officeId)
      .order("sort_order", { ascending: true }),
  ]);

  const office_hours = (hoursRows ?? []).map((row) => ({
    day: DAY_NAMES[row.day_of_week],
    day_of_week: row.day_of_week,
    open_time: row.open_time,
    close_time: row.close_time,
    is_closed: row.is_closed,
  }));

  const notes = (notesRows ?? []).map((row) => ({
    label: row.label,
    content: row.content,
  }));

  return NextResponse.json({ office_hours, notes }, { headers: corsHeaders() });
}
