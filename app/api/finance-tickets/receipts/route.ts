import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { RECEIPT_BUCKET, normaliseImage, readReceipt, type ReceiptExtract } from "@/lib/financeReceipts";

export const maxDuration = 60;

// Snap a receipt on the new-ticket form: store the photo (unattached
// until the ticket is submitted) and read vendor / total / date from it.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No photo received." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "That photo is over 15 MB." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Please use a photo (JPG or PNG) of the receipt." }, { status: 400 });

  const { buffer, contentType } = await normaliseImage(Buffer.from(await file.arrayBuffer()));
  const path = `pending/${me.id}/${randomUUID()}.jpg`;
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from(RECEIPT_BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (upErr) return NextResponse.json({ error: `Couldn't save the photo: ${upErr.message}` }, { status: 500 });

  let extracted: ReceiptExtract | null = null;
  let readError: string | null = null;
  try {
    extracted = await readReceipt(buffer, contentType);
  } catch (e) {
    readError = e instanceof Error ? e.message : "Couldn't read the receipt.";
  }

  await admin.from("finance_ticket_receipts").insert({ uploaded_by: me.id, storage_path: path, content_type: contentType, extracted });
  const { data: signed } = await admin.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60 * 60);

  return NextResponse.json({ path, previewUrl: signed?.signedUrl ?? null, extracted, readError });
}
