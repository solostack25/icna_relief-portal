import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET, RECEIPT_COLUMNS, cleanReceiptFields, receiptAccess, touchSession } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";

// POST { officeId, fields, paths, discard? } — add a reviewed receipt as the
// next row of the session. discard: true just cleans up the scan's photos.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const access = await receiptAccess(body.officeId, params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const admin = createAdminClient();
  // Only accept photo paths from this session's own folder.
  const paths: string[] = (Array.isArray(body.paths) ? body.paths : [])
    .filter((p: unknown): p is string => typeof p === "string" && p.startsWith(`${params.id}/`) && !p.includes(".."))
    .slice(0, 8);

  if (body.discard) {
    if (paths.length) await admin.storage.from(RECEIPTS_BUCKET).remove(paths);
    return NextResponse.json({ ok: true });
  }

  const fields = cleanReceiptFields(body.fields ?? {});
  const { data, error } = await admin
    .from("inkind_receipts")
    .insert({ ...fields, session_id: params.id, image_paths: paths.length ? paths : null })
    .select(RECEIPT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await touchSession(params.id);
  return NextResponse.json({ receipt: data });
}
