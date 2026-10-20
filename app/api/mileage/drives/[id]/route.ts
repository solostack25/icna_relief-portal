import { NextResponse } from "next/server";
import { drivingMiles, reverseGeocode } from "@/lib/mileage";
import { requireEmployee, DRIVE_COLUMNS, validCoord } from "../../_auth";

const round2 = (n: number) => Math.round(n * 100) / 100;

// PATCH { action: "end", lat, lng, accuracy?, gps_miles?, gps_points? }
//   End Trip: saves the end point, looks up driving miles + addresses.
// PATCH { action: "describe", purpose, billing_office_id?, billing_program?, round_trip?, miles?, adjusted_reason? }
//   The "why did you drive" sheet. Marks the drive ready to submit.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const { data: drive } = await auth.supabase
    .from("finance_mileage_drives")
    .select(DRIVE_COLUMNS)
    .eq("id", id)
    .eq("employee_id", auth.employeeId)
    .maybeSingle();
  if (!drive) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  if (drive.status === "submitted" || drive.status === "discarded") {
    return NextResponse.json({ error: "This trip has already been submitted." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  if (body.action === "end") {
    if (drive.status !== "in_progress") return NextResponse.json({ error: "This trip has already ended." }, { status: 409 });
    if (!validCoord(body.lat, body.lng)) return NextResponse.json({ error: "Your location couldn't be read. Check location permission and try again." }, { status: 400 });

    const start = { lat: drive.start_lat as number, lng: drive.start_lng as number };
    const end = { lat: body.lat as number, lng: body.lng as number };
    const gpsMiles = typeof body.gps_miles === "number" && body.gps_miles >= 0 ? round2(body.gps_miles) : null;

    const [route, startAddr, endAddr] = await Promise.all([drivingMiles(start, end, gpsMiles), reverseGeocode(start), reverseGeocode(end)]);

    const { data, error } = await auth.supabase
      .from("finance_mileage_drives")
      .update({
        ended_at: now,
        end_lat: end.lat,
        end_lng: end.lng,
        end_accuracy_m: typeof body.accuracy === "number" ? body.accuracy : null,
        start_address_line1: startAddr.line1,
        start_city: startAddr.city,
        start_state: startAddr.state,
        start_zip_code: startAddr.zip,
        end_address_line1: endAddr.line1,
        end_city: endAddr.city,
        end_state: endAddr.state,
        end_zip_code: endAddr.zip,
        route_miles: route.miles,
        route_provider: route.provider,
        gps_miles: gpsMiles,
        gps_points: typeof body.gps_points === "number" ? Math.round(body.gps_points) : null,
        miles: route.miles,
        // Stays out of "in_progress" so a new trip can start, but isn't
        // submittable until the purpose sheet is filled in.
        status: "ready",
        purpose: null,
        updated_at: now,
      })
      .eq("id", drive.id)
      .select(DRIVE_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ drive: data });
  }

  if (body.action === "describe") {
    if (drive.status === "in_progress") return NextResponse.json({ error: "End the trip first." }, { status: 409 });
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    if (purpose.length < 3) return NextResponse.json({ error: "Tell Finance why you made this trip." }, { status: 400 });

    const roundTrip = !!body.round_trip;
    const routeMiles = Number(drive.route_miles ?? 0);
    const computed = round2(routeMiles * (roundTrip ? 2 : 1));
    let miles = computed;
    let adjusted = false;
    let reason: string | null = null;
    if (body.miles !== undefined && body.miles !== null && body.miles !== "") {
      const m = Number(body.miles);
      if (!Number.isFinite(m) || m < 0 || m > 2000) return NextResponse.json({ error: "Enter a valid number of miles." }, { status: 400 });
      miles = round2(m);
      adjusted = Math.abs(miles - computed) >= 0.1;
      if (adjusted) {
        reason = typeof body.adjusted_reason === "string" ? body.adjusted_reason.trim() : "";
        if (!reason) return NextResponse.json({ error: "Add a short note on why the miles differ from the tracked route." }, { status: 400 });
      }
    }

    const { data, error } = await auth.supabase
      .from("finance_mileage_drives")
      .update({
        purpose,
        billing_office_id: body.billing_office_id || drive.billing_office_id || auth.assignedOfficeId,
        billing_program: typeof body.billing_program === "string" && body.billing_program.trim() ? body.billing_program.trim() : null,
        round_trip: roundTrip,
        miles,
        miles_adjusted: adjusted,
        adjusted_reason: adjusted ? reason : null,
        status: "ready",
        updated_at: now,
      })
      .eq("id", drive.id)
      .select(DRIVE_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ drive: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// DELETE: discard a trip that hasn't been submitted (wrong start, forgot to end, personal drive).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("finance_mileage_drives")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("employee_id", auth.employeeId)
    .in("status", ["in_progress", "ready"])
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Trip not found or already submitted" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
