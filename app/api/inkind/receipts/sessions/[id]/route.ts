import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET, RECEIPT_COLUMNS, receiptAccess } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

// GET    session + its receipts (in scan order = Excel row order)
// PATCH  { officeId, name }   rename
// DELETE ?officeId=           delete the session, its rows and photos
export async function GET(req: NextRequest, { params }: Ctx) {
  const access = await receiptAccess(req.nextUrl.searchParams.get("officeId"), params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { data: receipts, error } = await createAdminClient()
    .from("inkind_receipts")
    .select(RECEIPT_COLUMNS)
    .eq("session_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: access.session, receipts: receipts ?? [] });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await req.json().catch(() => ({}));
  const access = await receiptAccess(body.officeId, params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Give the session a name" }, { status: 400 });
  const { error } = await createAdminClient()
    .from("inkind_receipt_sessions")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const access = await receiptAccess(req.nextUrl.searchParams.get("officeId"), params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = createAdminClient();
  const { data: rows } = await admin.from("inkind_receipts").select("image_paths").eq("session_id", params.id);
  const paths = ((rows ?? []) as { image_paths: string[] | null }[]).flatMap((r) => r.image_paths ?? []);
  const { error } = await admin.from("inkind_receipt_sessions").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (paths.length) await admin.storage.from(RECEIPTS_BUCKET).remove(paths);
  return NextResponse.json({ ok: true });
}
