import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserCalendarView, getTodayCalendarView } from "@/lib/msgraph";

// Always resolves to the SIGNED-IN employee's own mailbox, looked up
// from the session — never accepts an email or employee id from the
// caller. App-only Graph auth can technically read any mailbox in the
// tenant, so this route is the only thing standing between that and
// someone reading a colleague's calendar. Keep it that way.
//
// GET /api/me/calendar                       -> today, Central time
// GET /api/me/calendar?start=...&end=...     -> that window (naive
//   local strings, e.g. "2026-09-14T00:00:00" — see the comment on
//   getUserCalendarView in lib/msgraph.ts for why no "Z"/offset)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("email")
    .eq("auth_user_id", user.id)
    .single();
  if (!me?.email) {
    return NextResponse.json({ error: "No employee record found for this account" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  try {
    const events =
      start && end ? await getUserCalendarView(me.email, start, end) : await getTodayCalendarView(me.email);
    return NextResponse.json({ events });
  } catch (e) {
    // Most likely cause: Calendars.Read isn't granted + admin-consented
    // yet on the "Portal" Graph app registration. Don't fail the page
    // over this — report it so the UI can show a disconnected state,
    // same pattern as /api/admin/graph/licenses.
    return NextResponse.json(
      { events: [], error: e instanceof Error ? e.message : "Could not load calendar" },
      { status: 200 }
    );
  }
}
