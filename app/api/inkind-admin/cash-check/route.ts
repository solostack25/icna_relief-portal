import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { CHECK_BUCKET, isCashCheckSalesforceReady } from "@/lib/inkind/cashCheck";

// Lists cash/check donations + money orders for the admin screen. Reads
// go through the RLS-scoped client so office / regional scoping matches
// the rest of InKind admin.
export async function GET() {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const supabase = await createClient();
  const [{ data: donations, error: dErr }, { data: moneyOrders, error: mErr }] = await Promise.all([
    supabase.from("inkind_cash_donations").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("inkind_money_orders").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  if (dErr || mErr) return NextResponse.json({ error: (dErr ?? mErr)!.message }, { status: 500 });

  return NextResponse.json({
    donations: donations ?? [],
    moneyOrders: moneyOrders ?? [],
    salesforceReady: isCashCheckSalesforceReady(),
  });
}

// Removes a donation entered by mistake. Only allowed before it's in a
// money order.
export async function DELETE(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: row } = await supabase.from("inkind_cash_donations").select("id, status, check_image_path").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "received") {
    return NextResponse.json({ error: "Remove it from its money order first" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("inkind_cash_donations").delete().eq("id", id).eq("status", "received");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (row.check_image_path) await admin.storage.from(CHECK_BUCKET).remove([row.check_image_path]);
  return NextResponse.json({ success: true });
}
