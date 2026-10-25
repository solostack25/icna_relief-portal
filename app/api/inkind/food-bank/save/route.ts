import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveIntakeOffice } from "@/lib/inkind/offices";
import { loadFoodCatalog, loadInvoiceAttachments } from "@/lib/inkind/foodBank";
import { pushSessionToSalesforce, type DonationLineForSync } from "@/lib/inkind/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InLine = { item_code: string; qty: number; description?: string };

// Step 2 of a food bank intake: the reviewed lines are saved as a
// completed in-kind session (organization donor = the food bank, no
// signature step) and pushed straight to Salesforce. Prices come from the
// catalog here on the server — the page only sends item + quantity.
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

  const catalog = await loadFoodCatalog();
  const byCode = new Map(catalog.map((c) => [c.code, c]));

  // Merge lines that map to the same catalog item (donations is unique on
  // session + item + condition); the invoice descriptions become notes.
  const merged = new Map<string, { qty: number; notes: string[] }>();
  for (const l of (Array.isArray(body.lines) ? body.lines : []) as InLine[]) {
    const qty = Math.round(Number(l?.qty) * 100) / 100;
    if (!byCode.has(l?.item_code) || !Number.isFinite(qty) || qty <= 0) continue;
    const m = merged.get(l.item_code) ?? { qty: 0, notes: [] };
    m.qty = Math.round((m.qty + qty) * 100) / 100;
    if (l.description) m.notes.push(String(l.description).trim().slice(0, 80));
    merged.set(l.item_code, m);
  }
  if (merged.size === 0) return NextResponse.json({ error: "Add at least one line with an item and quantity" }, { status: 400 });

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

  const { error: dErr } = await admin.from("donations").insert(lines.map((l) => ({ session_id: session.id, ...l })));
  if (dErr) {
    await admin.from("sessions").delete().eq("id", session.id);
    return NextResponse.json({ error: `Could not save the lines: ${dErr.message}` }, { status: 500 });
  }

  const totalValue = lines.reduce((a, l) => a + l.unit_price * l.qty, 0);

  // Push to Salesforce now. If it fails the intake is still saved — it
  // shows as "Not synced" on the InKind dashboard with a retry button.
  let salesforce: { success: boolean; summary: string };
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

  return NextResponse.json({
    success: true,
    sessionId: session.id,
    invoiceId,
    totalValue: Math.round(totalValue * 100) / 100,
    lineCount: lines.length,
    salesforce,
  });
}
