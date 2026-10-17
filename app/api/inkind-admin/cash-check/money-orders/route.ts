import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { sumAmounts } from "@/lib/inkind/cashCheck";

// Creates a money order from the selected donations and marks each one
// 'batched'. The money order row + money_order_id on each donation is the
// permanent record of which donations went into which money order.
export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const donationIds: string[] = Array.isArray(body.donationIds) ? body.donationIds.filter((x: unknown) => typeof x === "string") : [];
  const moneyOrderNumber = String(body.moneyOrderNumber ?? "").trim().slice(0, 50);
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const purchasedOn = String(body.purchasedOn ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const notes = String(body.notes ?? "").trim().slice(0, 1000) || null;

  if (!donationIds.length) return NextResponse.json({ error: "Select at least one donation" }, { status: 400 });
  if (!moneyOrderNumber) return NextResponse.json({ error: "Money order number is required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter the money order amount" }, { status: 400 });

  // Read through RLS so a user can only batch donations they can see.
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("inkind_cash_donations")
    .select("id, amount, status, office_id, office")
    .in("id", donationIds);
  if (!rows || rows.length !== donationIds.length) {
    return NextResponse.json({ error: "Some selected donations weren't found" }, { status: 404 });
  }
  if (rows.some((r) => r.status !== "received")) {
    return NextResponse.json({ error: "Some selected donations are already in a money order" }, { status: 409 });
  }
  const offices = new Set(rows.map((r) => r.office_id));
  if (offices.size > 1) return NextResponse.json({ error: "Select donations from one office at a time" }, { status: 400 });

  const total = sumAmounts(rows);
  if (Math.round(total * 100) !== Math.round(amount * 100) && !notes) {
    return NextResponse.json(
      { error: `Money order amount doesn't match the selected donations (${total.toFixed(2)}). Add a note explaining the difference.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: mo, error: moErr } = await admin
    .from("inkind_money_orders")
    .insert({
      office_id: rows[0].office_id,
      office: rows[0].office,
      money_order_number: moneyOrderNumber,
      amount,
      donations_total: total,
      purchased_on: purchasedOn,
      notes,
      created_by: access.employeeId,
    })
    .select("id")
    .single();
  if (moErr || !mo) return NextResponse.json({ error: moErr?.message ?? "Couldn't create money order" }, { status: 500 });

  // Guard on status so a concurrent batch can't double-assign a donation.
  const { data: updated, error: upErr } = await admin
    .from("inkind_cash_donations")
    .update({ status: "batched", money_order_id: mo.id })
    .in("id", donationIds)
    .eq("status", "received")
    .select("id");
  if (upErr || (updated?.length ?? 0) !== donationIds.length) {
    await admin.from("inkind_cash_donations").update({ status: "received", money_order_id: null }).eq("money_order_id", mo.id);
    await admin.from("inkind_money_orders").delete().eq("id", mo.id);
    return NextResponse.json({ error: upErr?.message ?? "Donations changed while saving - try again" }, { status: 409 });
  }

  return NextResponse.json({ success: true, id: mo.id });
}

// Undo a money order (e.g. wrong donations selected). Only before anything
// in it has been pushed to Salesforce.
export async function DELETE(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: mo } = await supabase.from("inkind_money_orders").select("id").eq("id", id).maybeSingle();
  if (!mo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("inkind_cash_donations")
    .select("id", { count: "exact", head: true })
    .eq("money_order_id", id)
    .eq("status", "synced");
  if (count) return NextResponse.json({ error: "Donations in this money order are already in Salesforce" }, { status: 409 });

  await admin.from("inkind_cash_donations").update({ status: "received", money_order_id: null }).eq("money_order_id", id);
  const { error } = await admin.from("inkind_money_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
