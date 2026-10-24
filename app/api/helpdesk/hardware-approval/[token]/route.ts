import { NextResponse } from "next/server";
import { getHardwareApprovalByToken, decideHardwareApproval, rolesLabel, lineTotal } from "@/lib/helpdeskHardware";

export const maxDuration = 60;

// Public (the token in the emailed link is the credential) - same model
// as the Finance Ticket, Zakat and Speaker approval links, so approvers
// can decide from their phone without logging in.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getHardwareApprovalByToken(token);
  if (!found) return NextResponse.json({ error: "This approval link isn't valid." }, { status: 404 });
  const { step, ctx, steps } = found;
  const d = ctx.detail ?? {};
  const city = [d.ship_city, [d.ship_state, d.ship_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return NextResponse.json({
    step: { stage: step.stage, roles: rolesLabel(step.roles), approver_name: step.approver_name, decision: step.decision, decided_at: step.decided_at },
    ticket: {
      ticket_number: ctx.request.ticket_number,
      title: ctx.request.title,
      description: ctx.request.description,
      requested_by: ctx.request.submitted_by,
      requested_by_email: ctx.request.submitted_by_email,
      approval_status: ctx.leg.hardware_approval_status,
      ship_to: d.ship_address_line1 ? [d.ship_to_name, d.ship_address_line1, d.ship_address_line2, city].filter(Boolean).join("\n") : null,
      grant: d.is_grant_purchase ? d.grant_name ?? "Yes" : null,
      line_items: ctx.items,
      line_items_total: ctx.items.length ? lineTotal(ctx.items) : null,
      supervisor_amount: ctx.proposedAmount,
      budget: ctx.budget,
    },
    steps: steps
      .filter((s) => s.decision !== "superseded" || s.decided_at)
      .map((s) => ({
        stage: s.stage,
        roles: rolesLabel(s.roles),
        approver_name: s.approver_name,
        decision: s.decision,
        decided_at: s.decided_at,
        notes: s.notes,
        approved_amount: s.approved_amount != null ? Number(s.approved_amount) : null,
      })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.decision !== "approve" && body.decision !== "deny") {
    return NextResponse.json({ error: "decision must be 'approve' or 'deny'" }, { status: 400 });
  }
  if (body.decision === "deny" && !String(body.notes ?? "").trim()) {
    return NextResponse.json({ error: "Add a short reason when denying so the requester knows why." }, { status: 400 });
  }
  try {
    const amount = body.amount === undefined || body.amount === null || body.amount === "" ? null : Number(String(body.amount).replace(/[$,\s]/g, ""));
    const result = await decideHardwareApproval({ token, decision: body.decision, notes: body.notes, amount });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 400 });
  }
}
