import { NextResponse } from "next/server";
import { decideFinanceTicketApproval } from "@/lib/financeTickets";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  if (!["approve", "reject", "fix"].includes(body.decision)) {
    return NextResponse.json({ error: "decision must be 'approve', 'reject', or 'fix'" }, { status: 400 });
  }

  try {
    const result = await decideFinanceTicketApproval({ token, decision: body.decision, notes: body.notes });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 400 });
  }
}
