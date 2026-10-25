import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveIntakeOffice } from "@/lib/inkind/offices";
import {
  FOOD_BANK_BUCKET,
  MAX_INVOICE_PAGES,
  extractFoodBankInvoice,
  loadFoodCatalog,
} from "@/lib/inkind/foodBank";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Step 1 of a food bank intake: photos of the invoice in, structured
// lines out. Photos are normalized (rotated, resized, JPEG) and kept in a
// private bucket under drafts/<scanId>/ so the save step can attach them
// to the session and to Salesforce without re-uploading.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const officeIdRaw = form.get("officeId");
  const { office, error: officeError } = await resolveIntakeOffice(typeof officeIdRaw === "string" ? officeIdRaw : null);
  if (!office) return NextResponse.json({ error: officeError }, { status: 400 });

  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Take a photo of the invoice first" }, { status: 400 });
  if (files.length > MAX_INVOICE_PAGES) {
    return NextResponse.json({ error: `Up to ${MAX_INVOICE_PAGES} pages per invoice` }, { status: 400 });
  }
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Invoice photos must be JPEG/PNG under 8 MB" }, { status: 400 });
    }
  }

  const sharp = (await import("sharp")).default;
  const scanId = randomUUID();
  const admin = createAdminClient();
  const dataUris: string[] = [];
  const paths: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const jpeg = await sharp(Buffer.from(await files[i].arrayBuffer()))
      .rotate() // honor phone EXIF orientation
      .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const path = `drafts/${scanId}/${i + 1}.jpg`;
    const { error: upErr } = await admin.storage.from(FOOD_BANK_BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
    if (upErr) return NextResponse.json({ error: `Couldn't save the invoice photo: ${upErr.message}` }, { status: 500 });
    paths.push(path);
    dataUris.push(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  }

  const catalog = await loadFoodCatalog();
  if (catalog.length === 0) {
    return NextResponse.json({ error: "No Hunger Prevention items are in the price catalog yet." }, { status: 500 });
  }

  // Food banks this office has used before, for the name picker.
  const { data: prior } = await admin
    .from("sessions")
    .select("donor_org_name")
    .eq("source", "food_bank")
    .eq("office_id", office.id)
    .not("donor_org_name", "is", null)
    .order("completed_at", { ascending: false })
    .limit(50);
  const knownFoodBanks = Array.from(new Set((prior ?? []).map((p: any) => p.donor_org_name as string)));

  try {
    const extracted = await extractFoodBankInvoice(dataUris, catalog);
    return NextResponse.json({ scanId, paths, extracted, catalog, knownFoodBanks });
  } catch (err: any) {
    await admin.storage.from(FOOD_BANK_BUCKET).remove(paths);
    return NextResponse.json({ error: err.message ?? "Couldn't read the invoice" }, { status: 502 });
  }
}
