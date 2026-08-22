import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { requesterEmail, officeName, allOffices } = (await req.json()) as {
    requesterEmail: string;
    officeName?: string;
    allOffices?: boolean;
  };

  if (!requesterEmail?.trim()) {
    return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  let officeId: string | null = null;

  if (officeName?.trim()) {
    const { data: matches } = await admin.from("b2s_offices").select("id, field_office").ilike("field_office", `%${officeName}%`).limit(5);
    if (!matches || matches.length === 0) {
      return NextResponse.json({ error: `No office found matching "${officeName}".` }, { status: 404 });
    }
    if (matches.length > 1) {
      return NextResponse.json({ ambiguous_target: true, candidates: matches.map((m: { field_office: string }) => m.field_office) });
    }
    officeId = matches[0].id;
  } else if (!allOffices) {
    // Default to the requester's own office unless they explicitly
    // asked for events everywhere - most "when's the next volunteer
    // event" questions mean "near me".
    const requester = await lookupEmployeeByEmail(requesterEmail);
    officeId = requester?.assigned_office_id ?? null;
  }

  let query = admin
    .from("volunteer_events")
    .select("id, office_id, title, slug, starts_on, ends_on")
    .eq("is_published", true)
    .gte("starts_on", today)
    .order("starts_on", { ascending: true })
    .limit(10);

  if (officeId) query = query.eq("office_id", officeId);

  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventIds = (events ?? []).map((e: { id: string }) => e.id);
  const officeIds = [...new Set((events ?? []).map((e: { office_id: string }) => e.office_id))];

  const [{ data: offices }, { data: availability }] = await Promise.all([
    admin.from("b2s_offices").select("id, field_office").in("id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("volunteer_slot_availability")
      .select("event_id, spots_remaining")
      .in("event_id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const officeMap = new Map((offices ?? []).map((o: { id: string; field_office: string }) => [o.id, o.field_office]));
  const remainingByEvent = new Map<string, number>();
  for (const row of availability ?? []) {
    remainingByEvent.set(row.event_id, (remainingByEvent.get(row.event_id) ?? 0) + (row.spots_remaining ?? 0));
  }

  return NextResponse.json({
    events: (events ?? []).map((e: { id: string; title: string; office_id: string; starts_on: string; ends_on: string }) => ({
      title: e.title,
      office: officeMap.get(e.office_id) ?? null,
      starts_on: e.starts_on,
      ends_on: e.ends_on,
      spots_remaining: remainingByEvent.get(e.id) ?? 0,
      url: `/volunteer/${e.id}`,
    })),
  });
}
