import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signups, error } = await supabase
    .from("volunteer_signups")
    .select("id, slot_id, name, email, phone, qty, notes, waiver_signed, source, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!signups || signups.length === 0) {
    return NextResponse.json({ error: "No signups to export" }, { status: 404 });
  }

  const slotIds = [...new Set(signups.map((s) => s.slot_id))];
  const { data: slots } = await supabase
    .from("volunteer_slots")
    .select("id, event_id, label, slot_type")
    .in("id", slotIds.length ? slotIds : ["00000000-0000-0000-0000-000000000000"]);

  const slotMap = new Map((slots ?? []).map((s) => [s.id, s]));

  const eventIds = [...new Set(Array.from(slotMap.values()).map((s) => s.event_id))];
  const { data: events } = await supabase
    .from("volunteer_events")
    .select("id, office_id, title, slug")
    .in("id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"]);
  const eventMap = new Map((events ?? []).map((e) => [e.id, e]));

  const officeIds = [...new Set((events ?? []).map((e) => e.office_id))];
  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region")
    .in("id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]);
  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));

  const rows = signups.map((s) => {
    const slot = slotMap.get(s.slot_id);
    const event = slot ? eventMap.get(slot.event_id) : undefined;
    const office = event ? officeMap.get(event.office_id) : undefined;

    return {
      REGION: office?.region ?? "",
      OFFICE: office?.field_office ?? "",
      EVENT: event?.title ?? "",
      SLOT: slot?.label ?? "",
      SLOT_TYPE: slot?.slot_type ?? "",
      NAME: s.name,
      EMAIL: s.email,
      PHONE: s.phone ?? "",
      QTY: s.qty,
      NOTES: s.notes ?? "",
      WAIVER_SIGNED: s.waiver_signed ? "yes" : "no",
      SOURCE: s.source,
      SIGNED_UP_AT: s.created_at,
    };
  });

  const headers = Object.keys(rows[0]);
  const csvRows = rows.map((row) =>
    headers
      .map((h) => {
        const val = row[h as keyof typeof row];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(",")
  );

  const csv = [headers.join(","), ...csvRows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="volunteer_signups_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
