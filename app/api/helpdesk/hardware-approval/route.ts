import { NextResponse } from "next/server";
import { hardwareViewer } from "@/lib/helpdeskHardwareAccess";
import { startHardwareApproval, resendHardwareApprovals } from "@/lib/helpdeskHardware";

export const maxDuration = 60;

// POST { legId, action: "start" | "resend" }
//   start  - kicks off approval right after a hardware ticket is created
//            (no-op if already started or not a gated hardware ticket)
//   resend - re-emails whoever is pending, or re-routes a stuck stage
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const legId = String(body.legId ?? "");
  const action = body.action === "resend" ? "resend" : "start";

  const access = await hardwareViewer(legId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const result = action === "resend" ? await resendHardwareApprovals(legId) : await startHardwareApproval(legId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 400 });
  }
}
