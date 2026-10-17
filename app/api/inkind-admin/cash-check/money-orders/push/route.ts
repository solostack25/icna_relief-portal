import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { pushMoneyOrderToSalesforce } from "@/lib/inkind/cashCheck";

export const maxDuration = 60;

// Pushes each donation in a money order to Salesforce as its own record.
export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { moneyOrderId } = await req.json();
  if (!moneyOrderId) return NextResponse.json({ error: "moneyOrderId is required" }, { status: 400 });

  // Scope check through RLS before the service-role push.
  const supabase = await createClient();
  const { data: mo } = await supabase.from("inkind_money_orders").select("id").eq("id", moneyOrderId).maybeSingle();
  if (!mo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await pushMoneyOrderToSalesforce(moneyOrderId, access.employeeId);
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
