import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { requesterEmail, officeName } = (await req.json()) as { requesterEmail: string; officeName?: string };

  if (!requesterEmail?.trim()) {
    return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let officeId: string | null = null;
  let officeLabel = "";

  if (officeName?.trim()) {
    const { data: matches } = await admin.from("b2s_offices").select("id, field_office").ilike("field_office", `%${officeName}%`).limit(5);
    if (!matches || matches.length === 0) {
      return NextResponse.json({ error: `No office found matching "${officeName}".` }, { status: 404 });
    }
    if (matches.length > 1) {
      return NextResponse.json({
        ambiguous_target: true,
        candidates: matches.map((m: { field_office: string }) => m.field_office),
      });
    }
    officeId = matches[0].id;
    officeLabel = matches[0].field_office;
  } else {
    const requester = await lookupEmployeeByEmail(requesterEmail);
    if (!requester?.assigned_office_id) {
      return NextResponse.json({
        error: "No office specified and this employee has no assigned office on file. Ask which office they mean.",
      });
    }
    officeId = requester.assigned_office_id;
    const { data: office } = await admin.from("b2s_offices").select("field_office").eq("id", officeId).single();
    officeLabel = office?.field_office ?? "";
  }

  const [{ data: hoursRows }, { data: notesRows }] = await Promise.all([
    admin.from("office_hours").select("day_of_week, open_time, close_time, is_closed").eq("office_id", officeId).order("day_of_week"),
    admin.from("office_info_notes").select("label, content").eq("office_id", officeId).order("sort_order"),
  ]);

  return NextResponse.json({
    office: officeLabel,
    hours: (hoursRows ?? []).map((r: { day_of_week: number; is_closed: boolean; open_time: string | null; close_time: string | null }) => ({
      day: DAY_NAMES[r.day_of_week],
      is_closed: r.is_closed,
      open_time: r.open_time,
      close_time: r.close_time,
    })),
    notes: (notesRows ?? []).map((n: { label: string; content: string | null }) => ({ label: n.label, content: n.content })),
  });
}
