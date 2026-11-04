import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET, receiptAccess } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";

// GET ?officeId=&n=1 — short-lived link to a receipt's photo.
export async function GET(req: NextRequest, { params }: { params: { id: string; receiptId: string } }) {
  const access = await receiptAccess(req.nextUrl.searchParams.get("officeId"), params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("inkind_receipts")
    .select("image_paths")
    .eq("id", params.receiptId)
    .eq("session_id", params.id)
    .maybeSingle();
  const n = Math.max(1, Number(req.nextUrl.searchParams.get("n")) || 1);
  const path = row?.image_paths?.[n - 1];
  if (!path) return NextResponse.json({ error: "No photo" }, { status: 404 });
  const { data, error } = await admin.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't open the photo" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
