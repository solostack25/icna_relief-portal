import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/server";
import { RECEIPT_COLUMNS, receiptAccess, type ReceiptRow } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Line",
  "Date",
  "Time",
  "Merchant",
  "Address",
  "Receipt #",
  "Payment Method",
  "Card Last 4",
  "Item Count",
  "Items",
  "Subtotal",
  "Tax",
  "Tip",
  "Discount",
  "Total",
  "Notes",
  "Scanned At",
];

// GET ?officeId= — the session as an Excel file. Sheet 1 has one row per
// receipt in scan order (line 1, line 2, ...); sheet 2 lists every item.
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

  const rows: (string | number | null)[][] = [HEADERS];
  receipts.forEach((r, i) => {
    const items = r.items ?? [];
    rows.push([
      i + 1,
      r.receipt_date,
      r.receipt_time,
      r.merchant,
      r.merchant_address,
      r.receipt_number,
      r.payment_method,
      r.card_last4,
      items.length,
      items.map((it) => (it.qty && it.qty !== 1 ? `${it.qty} x ${it.description}` : it.description)).join("; ").slice(0, 32000),
      r.subtotal,
      r.tax,
      r.tip,
      r.discount,
      r.total,
      r.notes,
      scannedAt(r.created_at),
    ]);
  });
  const sum = (k: "subtotal" | "tax" | "tip" | "discount" | "total") =>
    Math.round(receipts.reduce((a, r) => a + (Number(r[k]) || 0), 0) * 100) / 100;
  if (receipts.length) {
    rows.push([]);
    rows.push(["TOTAL", null, null, `${receipts.length} receipt${receipts.length === 1 ? "" : "s"}`, null, null, null, null,
      receipts.reduce((a, r) => a + (r.items?.length ?? 0), 0), null, sum("subtotal"), sum("tax"), sum("tip"), sum("discount"), sum("total"), null, null]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [6, 11, 9, 28, 34, 16, 14, 10, 9, 60, 11, 9, 9, 10, 11, 30, 16].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(receipts.length, 1), c: HEADERS.length - 1 } }) };
  // Money columns as currency.
  for (let r = 1; r < rows.length; r++) {
    for (const c of [10, 11, 12, 13, 14]) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = "$#,##0.00";
    }
  }

  const itemRows: (string | number | null)[][] = [["Line", "Date", "Merchant", "Receipt #", "Item", "Qty", "Unit Price", "Amount"]];
  receipts.forEach((r, i) => {
    for (const it of r.items ?? []) {
      itemRows.push([i + 1, r.receipt_date, r.merchant, r.receipt_number, it.description, it.qty, it.unit_price, it.amount]);
    }
  });
  const wsItems = XLSX.utils.aoa_to_sheet(itemRows);
  wsItems["!cols"] = [6, 11, 28, 16, 44, 7, 11, 11].map((wch) => ({ wch }));
  for (let r = 1; r < itemRows.length; r++) {
    for (const c of [6, 7]) {
      const cell = wsItems[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = "$#,##0.00";
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Receipts");
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const base = access.session.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Receipts";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
