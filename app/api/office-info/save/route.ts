import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Authenticated save for one office's hours grid + free-text notes.
// Deliberately does NOT do its own office/role check beyond "is logged
// in" — office_hours and office_info_notes RLS policies (admin full
// access, staff limited to my_assigned_office()) are the actual
// enforcement, same pattern as fundraisers' RLS-first approach. If a
// staff member's office_id in the payload doesn't match their assigned
// office, the upsert/delete simply affects 0 rows rather than erroring,
// which is fine here since the UI never lets them pick another office.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const officeId: string | undefined = body?.office_id;
  const hours: { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }[] =
    body?.office_hours ?? [];
  const notes: { id?: string; label: string; content: string | null; sort_order: number }[] = body?.notes ?? [];

  if (!officeId) return NextResponse.json({ error: "office_id is required" }, { status: 400 });

  // Hours grid: upsert all 7 days at once (unique(office_id, day_of_week)
  // handles the conflict target).
  if (hours.length > 0) {
    const { error: hoursError } = await supabase.from("office_hours").upsert(
      hours.map((h) => ({
        office_id: officeId,
        day_of_week: h.day_of_week,
        open_time: h.is_closed ? null : h.open_time,
        close_time: h.is_closed ? null : h.close_time,
        is_closed: h.is_closed,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "office_id,day_of_week" }
    );
    if (hoursError) return NextResponse.json({ error: hoursError.message }, { status: 500 });
  }

  // Notes: replace-all for this office is simplest given the list is
  // short and fully admin-edited each save (add/remove/rename/reorder
  // all happen client-side before one save click) — avoids reconciling
  // individual row diffs for a handful of free-text categories.
  const { error: deleteError } = await supabase.from("office_info_notes").delete().eq("office_id", officeId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (notes.length > 0) {
    const { error: notesError } = await supabase.from("office_info_notes").insert(
      notes.map((n, i) => ({
        office_id: officeId,
        label: n.label,
        content: n.content,
        sort_order: i,
      }))
    );
    if (notesError) return NextResponse.json({ error: notesError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
