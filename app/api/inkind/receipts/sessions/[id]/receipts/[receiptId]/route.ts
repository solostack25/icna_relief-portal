import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET, RECEIPT_COLUMNS, cleanReceiptFields, receiptAccess, touchSession } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; receiptId: string } };

// PATCH { officeId, fields }  fix a row
// DELETE ?officeId=           remove a row (rows below move up)
export async function PATCH(req: Request, { params }: Ctx) {
  const body = await req.json().catch(() => ({}));
  const access = await receiptAccess(body.officeId, params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { data, error } = await createAdminClient()
    .from("inkind_receipts")
    .update(cleanReceiptFields(body.fields ?? {}))
    .eq("id", params.receiptId)
    .eq("session_id", params.id)
    .select(RECEIPT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  await touchSession(params.id);
  return NextResponse.json({ receipt: data });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const access = await receiptAccess(req.nextUrl.searchParams.get("officeId"), params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("inkind_receipts")
    .delete()
    .eq("id", params.receiptId)
    .eq("session_id", params.id)
    .select("image_paths")
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  if (row.image_paths?.length) await admin.storage.from(RECEIPTS_BUCKET).remove(row.image_paths);
  await touchSession(params.id);
  return NextResponse.json({ ok: true });
}
