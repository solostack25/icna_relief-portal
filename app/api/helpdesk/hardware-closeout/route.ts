import { NextResponse } from "next/server";
import { hardwareViewer } from "@/lib/helpdeskHardwareAccess";
import { runHardwareCloseout } from "@/lib/helpdeskHardwareCloseout";

export const maxDuration = 60;

// POST { legId } - called right after a hardware ticket is closed (and by
// the Retry button on the ticket). Emails the requester the invoice and,
// for grant purchases, posts the invoices to Grant Management. Does
// nothing for tickets that aren't closed, approved hardware purchases.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const legId = String(body.legId ?? "");
  const access = await hardwareViewer(legId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    return NextResponse.json(await runHardwareCloseout(legId, access.viewer.employeeId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Close-out failed" }, { status: 500 });
  }
}
