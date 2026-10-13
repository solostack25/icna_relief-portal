import { NextResponse } from "next/server";
import { getApprovalByToken, decideSpeakerApproval, formatEventWhen, eventLabel } from "@/lib/speakerRequests";

export const maxDuration = 60;

// Public (token is the credential) - same model as IRFAS and Finance
// Ticket approval links, so an AM or leader can decide from email on
// their phone without logging in.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getApprovalByToken(token);
  if (!found) return NextResponse.json({ error: "This approval link isn't valid." }, { status: 404 });
  const r = found.request;
  return NextResponse.json({
    step: {
      gate: found.approval.gate,
      approver_name: found.approval.approver_name,
      approver_role: found.approval.approver_role,
      decision: found.approval.decision,
      decided_at: found.approval.decided_at,
    },
    request: {
      request_number: r.request_number,
      status: r.status,
      event: eventLabel(r),
      when: formatEventWhen(r),
      region: r.region,
      coordinator_name: r.coordinator_name,
      coordinator_email: r.coordinator_email,
      area_manager_name: r.area_manager_name,
      speaker_name: r.speaker_name,
      speaker_email: r.speaker_email,
      speaker_phone: r.speaker_phone,
      travel_required: r.travel_required,
      honorarium: Number(r.honorarium),
      travel_cost: Number(r.travel_cost),
      hotel_cost: Number(r.hotel_cost),
      total_cost: Number(r.total_cost),
      w9_on_file: r.w9_on_file,
      justification: r.justification,
      requires_leadership: r.requires_leadership,
      created_at: r.created_at,
    },
    approvals: found.approvals,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.decision !== "approve" && body.decision !== "deny") {
    return NextResponse.json({ error: "decision must be 'approve' or 'deny'" }, { status: 400 });
  }
  if (body.decision === "deny" && !String(body.notes ?? "").trim()) {
    return NextResponse.json({ error: "Please add a short reason when denying so the coordinator knows what to change." }, { status: 400 });
  }
  try {
    const result = await decideSpeakerApproval({ token, decision: body.decision, notes: body.notes });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 400 });
  }
}
