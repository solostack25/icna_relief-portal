import { NextResponse } from "next/server";
import { assertSessionOfficeAccess, getInkindAccess } from "@/lib/inkind/access";
import { postFoodBankCharges } from "@/lib/inkind/foodBankCharges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Retry posting a food bank intake's charges from the InKind dashboard —
// e.g. once the grant has been registered in Grant Management and mapped
// on the food bank profile. Only the parts not yet posted are done.
export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  if (!(await assertSessionOfficeAccess(sessionId))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  try {
    const r = await postFoodBankCharges(sessionId, access.employeeId);
    return NextResponse.json({ success: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't post the charges" }, { status: 500 });
  }
}
