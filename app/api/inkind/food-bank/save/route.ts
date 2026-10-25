import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveIntakeOffice } from "@/lib/inkind/offices";
import { loadFoodCatalog, loadInvoiceAttachments, loadOfficeFoodBanks, matchFoodBank } from "@/lib/inkind/foodBank";
import { postFoodBankCharges, type SessionCharges } from "@/lib/inkind/foodBankCharges";
import { pushSessionToSalesforce, type DonationLineForSync } from "@/lib/inkind/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InLine = {
  item_code?: string;
  qty?: number;
  description?: string;
  inkind?: boolean;
  product_cost?: number | null;
};

const money = (v: unknown) => {
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Step 2 of a food bank intake. The reviewed invoice is saved as a
// completed in-kind session (organization donor = the food bank, no
// signature step). Only the in-kind lines become donation lines; on
// offices whose food bank bills them (track_charges), the charges are
// stored on the session too.
//
// pushNow = true  -> push the in-kind lines to Salesforce AND post the
//                    charges (grant credit to Grant Management, amount
//                    owed as a Vendor Payment ticket)
// pushNow = false -> nothing leaves the portal yet; an admin reviews it on
//                    the InKind dashboard and pushes from there.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { office, error: officeError } = await resolveIntakeOffice(body.officeId);
  if (!office) return NextResponse.json({ error: officeError }, { status: 400 });

  const foodBankName = typeof body.foodBankName === "string" ? body.foodBankName.trim().slice(0, 150) : "";
  if (!foodBankName) return NextResponse.json({ error: "Enter the food bank's name" }, { status: 400 });

  const dateReceived = typeof body.dateReceived === "string" ? body.dateReceived : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReceived)) return NextResponse.json({ error: "Enter the date received" }, { status: 400 });

  const vendorInvoice = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim().slice(0, 60) || null : null;

  const scanId = typeof body.scanId === "string" ? body.scanId : "";
  const paths: string[] = Array.isArray(body.paths)
    ? body.paths.filter((p: unknown): p is string => typeof p === "string" && p.startsWith(`drafts/${scanId}/`) && !p.includes(".."))
    : [];
  if (!scanId || paths.length === 0) return NextResponse.json({ error: "Invoice photo is missing — scan it again" }, { status: 400 });

  // Signed-in staff open the Vendor Payment ticket under their own name.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).maybeSingle() : { data: null };
  const actorId: string | null = me?.id ?? null;

  const profiles = await loadOfficeFoodBanks(office.id);
  const profile = profiles.find((p) => p.id === body.foodBankId) ?? matchFoodBank(profiles, foodBankName);
  const rule = profile?.inkind_rule ?? "all_lines";

  const catalog = await loadFoodCatalog();
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const inLines = (Array.isArray(body.lines) ? body.lines : []) as InLine[];

  // Merge in-kind lines that map to the same catalog item (donations is
  // unique on session + item + condition); invoice descriptions -> notes.
  const merged = new Map<string, { qty: number; notes: string[] }>();
  const purchased: { description: string; product_cost: number }[] = [];
  for (const l of inLines) {
    const inkind = rule === "all_lines" ? true : l.inkind !== false;
    if (!inkind) {
      const cost = money(l.product_cost);
      if (cost > 0) purchased.push({ description: String(l.description ?? "Item").trim().slice(0, 80), product_cost: cost });
      continue;
    }
    const qty = Math.round(Number(l?.qty) * 100) / 100;
    if (!l.item_code || !byCode.has(l.item_code) || !Number.isFinite(qty) || qty <= 0) continue;
    const m = merged.get(l.item_code) ?? { qty: 0, notes: [] };
    m.qty = Math.round((m.qty + qty) * 100) / 100;
    if (l.description) m.notes.push(String(l.description).trim().slice(0, 80));
    merged.set(l.item_code, m);
  }

  let charges: SessionCharges | null = null;
  if (profile?.track_charges && body.charges) {
    const c = body.charges;
    const credits = (Array.isArray(c.grant_credits) ? c.grant_credits : [])
      .map((g: any) => ({ ref: String(g?.ref ?? "").trim().slice(0, 60), label: String(g?.label ?? "").trim().slice(0, 150), amount: money(g?.amount) }))
      .filter((g: { amount: number }) => g.amount > 0)
      .slice(0, 5);
    const owed = money(c.amount_owed);
    if (credits.length || owed > 0) {
      charges = {
        total_charges: c.total_charges == null ? null : money(c.total_charges),
        amount_owed: owed,
        purchased_value: Math.round(purchased.reduce((a, p) => a + p.product_cost, 0) * 100) / 100,
        purchased_lines: purchased.slice(0, 40),
        grant_credits: credits,
      };
    }
  }

  if (merged.size === 0 && !charges) {
    return NextResponse.json({ error: "Add at least one in-kind line with an item and quantity" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Same food bank invoice entered twice is the most likely mistake.
  if (vendorInvoice && !body.allowDuplicate) {
    const { data: dupe } = await admin
      .from("sessions")
      .select("invoice_id")
      .eq("source", "food_bank")
      .eq("office_id", office.id)
      .eq("vendor_invoice_number", vendorInvoice)
      .limit(1)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json(
        { error: `Food bank invoice #${vendorInvoice} was already entered (${dupe.invoice_id}).`, duplicate: true },
        { status: 409 }
      );
    }
  }

  const { data: invoiceId, error: invErr } = await admin.rpc("next_invoice_id", { prefix: office.inkindPrefix });
  if (invErr || !invoiceId) return NextResponse.json({ error: invErr?.message ?? "Could not generate an invoice number" }, { status: 500 });

  const description = `Food bank delivery – ${foodBankName}${vendorInvoice ? ` (invoice #${vendorInvoice})` : ""}`.slice(0, 255);

  const { data: session, error: sErr } = await admin
    .from("sessions")
    .insert({
      status: "completed",
      completed_at: new Date().toISOString(),
      invoice_id: invoiceId,
      office: office.name,
      office_id: office.id,
      program: "Hunger Prevention",
      donor_kind: "organization",
      donor_org_name: foodBankName,
      date_received: dateReceived,
      short_description: description,
      source: "food_bank",
      vendor_invoice_number: vendorInvoice,
      invoice_image_paths: paths,
      food_bank_id: profile?.id ?? null,
      charges,
    })
    .select("*")
    .single();
  if (sErr || !session) return NextResponse.json({ error: sErr?.message ?? "Could not save the intake" }, { status: 500 });

  const lines: DonationLineForSync[] = Array.from(merged.entries()).map(([code, m]) => {
    const item = byCode.get(code)!;
    return {
      item_code: item.code,
      item_name: item.name,
      condition: "new",
      qty: m.qty,
      unit_price: item.new_price,
      is_manual_price: false,
      notes: Array.from(new Set(m.notes)).join(", ").slice(0, 500) || null,
      program: item.program,
      program_code: item.program_code,
      goods_type: item.goods_type,
      sf_category: item.sf_category,
    };
  });

  if (lines.length) {
    const { error: dErr } = await admin.from("donations").insert(lines.map((l) => ({ session_id: session.id, ...l })));
    if (dErr) {
      await admin.from("sessions").delete().eq("id", session.id);
      return NextResponse.json({ error: `Could not save the lines: ${dErr.message}` }, { status: 500 });
    }
  }

  const totalValue = lines.reduce((a, l) => a + l.unit_price * l.qty, 0);
  const done = {
    success: true,
    sessionId: session.id,
    invoiceId,
    totalValue: Math.round(totalValue * 100) / 100,
    lineCount: lines.length,
  };

  if (body.pushNow === false) return NextResponse.json({ ...done, salesforce: null, charges, chargeWarnings: [] });

  // ---------- Salesforce (in-kind lines) ----------
  let salesforce: { success: boolean; summary: string } | null = null;
  if (lines.length) {
    try {
      const files = await loadInvoiceAttachments(paths, invoiceId);
      const result = await pushSessionToSalesforce(session, null, lines, files);
      const summary =
        result.error ??
        result.results.map((r) => (r.success ? `${r.program}: ✓${r.error ? ` (${r.error})` : ""}` : `${r.program}: ✗ ${r.error}`)).join(" | ");
      const firstHeaderId = result.results.find((r) => r.salesforceHeaderId)?.salesforceHeaderId;
      await admin
        .from("sessions")
        .update(
          result.success
            ? { synced_to_salesforce: true, salesforce_record_id: firstHeaderId ?? null, synced_at: new Date().toISOString(), sync_error: summary || null }
            : { sync_error: summary || "Unknown error" }
        )
        .eq("id", session.id);
      salesforce = { success: result.success, summary };
    } catch (err: any) {
      const msg = err.message ?? String(err);
      await admin.from("sessions").update({ sync_error: msg }).eq("id", session.id);
      salesforce = { success: false, summary: msg };
    }
  }

  // ---------- Charges (grant credit + amount owed) ----------
  let postedCharges: SessionCharges | null = charges;
  let chargeWarnings: string[] = [];
  if (charges) {
    try {
      const r = await postFoodBankCharges(session.id, actorId);
      postedCharges = r.charges;
      chargeWarnings = r.warnings;
    } catch (e: any) {
      chargeWarnings = [e.message ?? "Couldn't post the charges"];
    }
  }

  return NextResponse.json({ ...done, salesforce, charges: postedCharges, chargeWarnings });
}
