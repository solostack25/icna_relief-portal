import { NextResponse } from "next/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { syncMyDevice } from "@/lib/helpdesk/diagnostics";

// Self-service: ask Intune to sync the requester's own managed device.
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;
  const { requesterEmail, deviceKey } = (await req.json().catch(() => ({}))) as { requesterEmail?: string; deviceKey?: string };
  if (!requesterEmail || !deviceKey) return NextResponse.json({ error: "requesterEmail and deviceKey are required" }, { status: 400 });
  const me = await lookupEmployeeByEmail(requesterEmail);
  if (!me) return NextResponse.json({ error: "No employee record for this account." }, { status: 404 });
  try {
    const r = await syncMyDevice(me.id, deviceKey);
    return NextResponse.json({ ok: true, message: `Sync sent to ${r.device}. Keep it on and connected; it usually picks up updates and policies within 5–15 minutes. Restarting it afterward helps.` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed." }, { status: 400 });
  }
}
