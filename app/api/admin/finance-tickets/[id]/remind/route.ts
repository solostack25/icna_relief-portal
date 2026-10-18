import { NextResponse } from "next/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import { remindCurrentApprover } from "@/lib/financeTickets";

// POST — re-send the approval email to whoever the ticket is waiting on.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const { id } = await params;
  try {
    const r = await remindCurrentApprover(id, access.employeeId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send the reminder" }, { status: 500 });
  }
}
