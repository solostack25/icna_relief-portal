import { NextResponse } from "next/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { runDiagnostics, type Area } from "@/lib/helpdesk/diagnostics";

export const maxDuration = 60;

const AREAS: Area[] = ["sign-in", "email", "teams", "device", "printer", "network", "onedrive", "phone", "software", "security", "general"];

// Runs read-only checks on the REQUESTER's own account, devices and office.
// There is deliberately no parameter for checking someone else.
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;
  const { requesterEmail, area } = (await req.json().catch(() => ({}))) as { requesterEmail?: string; area?: string };
  if (!requesterEmail) return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  const me = await lookupEmployeeByEmail(requesterEmail);
  if (!me) return NextResponse.json({ error: "No employee record for this account." }, { status: 404 });
  try {
    const out = await runDiagnostics(me.id, AREAS.includes(area as Area) ? (area as Area) : "general");
    return NextResponse.json(out);
  } catch (e) {
    console.error("[helpdesk/diagnose]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Diagnostics failed." }, { status: 500 });
  }
}
