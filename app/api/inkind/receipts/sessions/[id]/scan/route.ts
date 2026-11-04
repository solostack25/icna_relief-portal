import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { MAX_RECEIPT_PHOTOS, RECEIPTS_BUCKET, extractReceipt, receiptAccess } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// POST (multipart: officeId, images[]) — read one receipt. Nothing is added
// to the sheet yet: staff check the fields, then the receipts route saves
// the row. Photos are kept under <sessionId>/<scanId>/ for that row.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const officeId = form.get("officeId");
  const access = await receiptAccess(typeof officeId === "string" ? officeId : null, params.id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Take a photo of the receipt first" }, { status: 400 });
  if (files.length > MAX_RECEIPT_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_RECEIPT_PHOTOS} photos per receipt` }, { status: 400 });
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Receipt photos must be JPEG/PNG under 8 MB" }, { status: 400 });
    }
  }

  const sharp = (await import("sharp")).default;
  const admin = createAdminClient();
  const scanId = randomUUID();
  const dataUris: string[] = [];
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const jpeg = await sharp(Buffer.from(await files[i].arrayBuffer()))
      .rotate()
      .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const path = `${params.id}/${scanId}/${i + 1}.jpg`;
    const { error: upErr } = await admin.storage.from(RECEIPTS_BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
    if (upErr) return NextResponse.json({ error: `Couldn't save the receipt photo: ${upErr.message}` }, { status: 500 });
    paths.push(path);
    dataUris.push(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  }

  try {
    const { fields, warnings } = await extractReceipt(dataUris);
    return NextResponse.json({ fields, warnings, paths });
  } catch (err: any) {
    await admin.storage.from(RECEIPTS_BUCKET).remove(paths);
    return NextResponse.json({ error: err.message ?? "Couldn't read the receipt" }, { status: 502 });
  }
}
