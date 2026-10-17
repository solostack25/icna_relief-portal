import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { sendCashCheckReceipt } from "@/lib/inkind/cashCheck";

// Resend a donor receipt. Only possible while the donor's email is still
// held (i.e. before the Salesforce push purges it).
export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { id } = await req.json();
  const supabase = await createClient();
  const { data: row } = await supabase.from("inkind_cash_donations").select("id").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await sendCashCheckReceipt(id);
  return NextResponse.json(result, { status: result.sent ? 200 : 400 });
}
