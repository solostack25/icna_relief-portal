import { NextResponse } from "next/server";
import { audit, getDeviceViewer } from "@/lib/devices/access";
import { getBitLockerKeys, getLapsPassword, loadDevice } from "@/lib/devices/actions";

// POST { type: "bitlocker" | "laps", reason, ticket_ref? }
// Fetches the secret live from Microsoft (it's never stored) and logs
// who looked at it and why. A reason is required.
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = body.type === "laps" ? "laps" : body.type === "bitlocker" ? "bitlocker" : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const ticketRef = typeof body.ticket_ref === "string" && body.ticket_ref.trim() ? body.ticket_ref.trim().slice(0, 60) : null;
  if (!type) return NextResponse.json({ error: "Unknown secret type" }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ error: "Say why you need it (e.g. the ticket or what happened)." }, { status: 400 });

  const device = await loadDevice(decodeURIComponent(key));
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const result = type === "bitlocker" ? await getBitLockerKeys(device) : await getLapsPassword(device);
  await audit({
    deviceKey: device.device_key,
    deviceName: device.display_name,
    action: type === "bitlocker" ? "view_bitlocker_key" : "view_laps_password",
    actorId: viewer.employeeId,
    reason,
    ticketRef,
    ok: !result.error,
    detail: result.error ? { error: result.error } : null,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
