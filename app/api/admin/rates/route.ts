import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { HP_FOOD_CATEGORIES } from "@/lib/bulkDistributions";

export const dynamic = "force-dynamic";

// Admin-only edits for the Rates & Values page.
//   { action: "food_price", category, price }        updates the in-kind price-list item the category uses
//   { action: "volunteer_rate_add", effective_from, rate }
//   { action: "volunteer_rate_update", effective_from, rate }
//   { action: "volunteer_rate_delete", effective_from }
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  return me?.role === "admin" ? me : null;
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body.action === "food_price") {
    const cat = HP_FOOD_CATEGORIES.find((c) => c.key === body.category);
    if (!cat || cat.itemCodes.length === 0) return NextResponse.json({ error: "That food category has no price-list item" }, { status: 400 });
    const price = Number(body.price);
    if (!(price > 0) || price > 10000) return NextResponse.json({ error: "Enter a price greater than 0" }, { status: 400 });
    const { data: items } = await admin.from("items").select("id, code, active").in("code", cat.itemCodes as unknown as string[]);
    const item = (cat.itemCodes as readonly string[])
      .map((code) => (items ?? []).find((i: { code: string; active: boolean }) => i.code === code && i.active))
      .find(Boolean) as { id: string } | undefined;
    if (!item) return NextResponse.json({ error: "Price-list item not found or inactive" }, { status: 404 });
    const { error } = await admin
      .from("items")
      .update({ new_price: Math.round(price * 100) / 100, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action?.startsWith("volunteer_rate_")) {
    const date = String(body.effective_from ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Choose the date the rate starts" }, { status: 400 });

    if (body.action === "volunteer_rate_delete") {
      const { count } = await admin.from("volunteer_hour_rates").select("effective_from", { count: "exact", head: true });
      if ((count ?? 0) <= 1) return NextResponse.json({ error: "Keep at least one rate" }, { status: 400 });
      const { error } = await admin.from("volunteer_hour_rates").delete().eq("effective_from", date);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const rate = Number(body.rate);
    if (!(rate > 0) || rate > 1000) return NextResponse.json({ error: "Enter an hourly value greater than 0" }, { status: 400 });
    const { error } = await admin
      .from("volunteer_hour_rates")
      .upsert({ effective_from: date, rate: Math.round(rate * 100) / 100 }, { onConflict: "effective_from" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
