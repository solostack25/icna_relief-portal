import { NextResponse } from "next/server";
import { getKioskViewer, listInkindOffices } from "@/lib/inkind/offices";

export const dynamic = "force-dynamic";

// Office list for the in-kind scanning station's office picker. Public
// (the station can run signed out) — returns only office names/ids.
export async function GET() {
  const [viewer, offices] = await Promise.all([getKioskViewer(), listInkindOffices()]);
  return NextResponse.json({
    offices: offices.map((o) => ({ id: o.id, name: o.name, state: o.state })),
    // Signed-in staff are locked to their own office; admins can switch.
    lockedOfficeId: viewer.signedIn && !viewer.isAdmin ? viewer.assignedOfficeId : null,
    defaultOfficeId: viewer.assignedOfficeId,
  });
}
