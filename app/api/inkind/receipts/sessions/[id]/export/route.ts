import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/server";
import { RECEIPT_COLUMNS, receiptAccess, type ReceiptRow } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Line",
  "Receipt #",
  "Date",
  "Donor Name",
  "Phone",
  "Email",
  "Address",
  "Received By",
  "Item Count",
  "Items",
  "Notes",
  "Scanned At",
];

// GET ?officeId= — the session as an Excel file. Sheet 1 has one row per
// receipt in scan order (line 1, line 2, ...) with the donor info;
// sheet 2 lists every item separately.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await receiptAccess(req.nextUrl.searchParams.get("officeId"), params.id);
  if ("error" in access || !access.session) {
    const a = access as { error: string; status: number };
    return NextResponse.json({ error: a.error }, { status: a.status });
  }
  const { data, error } = await createAdminClient()
    .from("inkind_receipts")
    .select(RECEIPT_COLUMNS)
    .eq("session_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const receipts = (data ?? []) as unknown as ReceiptRow[];

  const scannedAt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" });

  const itemText = (it: ReceiptRow["items"][number]) =>
    [it.qty != null ? `${it.qty}${it.unit ? ` ${it.unit}` : ""}` : null, it.description, it.condition ? `(${it.condition})` : null]
      .filter(Boolean)
      .join(" ");

  // Sheet 1: one row per receipt — the handwritten donor info.
  const rows: (string | number | null)[][] = [HEADERS];
  receipts.forEach((r, i) => {
    const items = r.items ?? [];
    rows.push([
      i + 1,
      r.receipt_number,
      r.receipt_date,
      r.donor_name,
      r.donor_phone,
      r.donor_email,
      r.donor_address,
      r.received_by,
      items.length,
      items.map(itemText).join("; ").slice(0, 32000),
      r.notes,
      scannedAt(r.created_at),
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [6, 11, 11, 24, 15, 26, 32, 16, 9, 70, 30, 16].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(receipts.length, 1), c: HEADERS.length - 1 } }) };

  // Sheet 2: every item, kept separate from the donor info.
  const itemRows: (string | number | null)[][] = [["Line", "Receipt #", "Donor Name", "Category", "Item", "Qty", "Unit", "Condition"]];
  receipts.forEach((r, i) => {
    for (const it of r.items ?? []) {
      itemRows.push([i + 1, r.receipt_number, r.donor_name, it.category, it.description, it.qty, it.unit, it.condition ? it.condition[0].toUpperCase() + it.condition.slice(1) : null]);
    }
  });
  const wsItems = XLSX.utils.aoa_to_sheet(itemRows);
  wsItems["!cols"] = [6, 11, 24, 24, 34, 7, 7, 10].map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Receipts");
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // Time-stamped so each download is its own file (no "(1)" copies or an
  // older copy still open in Excel getting mistaken for the latest).
  const stamp = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Chicago", hour12: false })
    .slice(0, 16)
    .replace(" ", "_")
    .replace(":", "");
  const base = `${access.session.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Receipts"}_${stamp}`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
