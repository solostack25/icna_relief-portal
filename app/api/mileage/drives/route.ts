import { NextResponse } from "next/server";
import { getMileageRate } from "@/lib/mileage";
import { loadMileageGrants } from "@/lib/mileageGrants";
import { requireEmployee, DRIVE_COLUMNS, validCoord } from "../_auth";

// GET: everything the Mileage Tracker screen needs in one call.
export async function GET() {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const [active, ready, submitted, offices, rate, grants] = await Promise.all([
    auth.supabase.from("finance_mileage_drives").select(DRIVE_COLUMNS).eq("employee_id", auth.employeeId).eq("status", "in_progress").maybeSingle(),
    auth.supabase.from("finance_mileage_drives").select(DRIVE_COLUMNS).eq("employee_id", auth.employeeId).eq("status", "ready").order("started_at", { ascending: false }),
    auth.supabase
      .from("finance_mileage_drives")
      .select(`${DRIVE_COLUMNS}, finance_tickets:finance_ticket_id(ticket_number, status)`)
      .eq("employee_id", auth.employeeId)
      .eq("status", "submitted")
      .order("started_at", { ascending: false })
      .limit(20),
    auth.supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office"),
    getMileageRate(),
    loadMileageGrants(auth.employeeId).catch(() => []),
  ]);

  if (active.error || ready.error) {
    return NextResponse.json({ error: (active.error ?? ready.error)!.message }, { status: 500 });
  }

  return NextResponse.json({
    active: active.data,
    ready: ready.data ?? [],
    submitted: submitted.data ?? [],
    offices: offices.data ?? [],
    rate,
    grants,
    assignedOfficeId: auth.assignedOfficeId,
  });
}

// POST: Start Trip.
export async function POST(req: Request) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  if (!validCoord(body.lat, body.lng)) return NextResponse.json({ error: "Your location couldn't be read. Check location permission and try again." }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("finance_mileage_drives")
    .insert({
      employee_id: auth.employeeId,
      start_lat: body.lat,
      start_lng: body.lng,
      start_accuracy_m: typeof body.accuracy === "number" ? body.accuracy : null,
      billing_office_id: auth.assignedOfficeId,
    })
    .select(DRIVE_COLUMNS)
    .single();

  if (error) {
    // Unique partial index: a trip is already running (e.g. started on another device).
    if (error.code === "23505") return NextResponse.json({ error: "You already have a trip running. End it first." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ drive: data });
}
