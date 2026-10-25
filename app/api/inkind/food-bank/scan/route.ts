import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveIntakeOffice } from "@/lib/inkind/offices";
import {
  FOOD_BANK_BUCKET,
  MAX_INVOICE_PAGES,
  extractFoodBankInvoice,
  loadFoodCatalog,
  loadOfficeFoodBanks,
  matchFoodBank,
  mappingFor,
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
  // A PDF invoice arrives as its pages rendered to images (for the AI)
  // plus the original file (kept and attached everywhere) and its text.
  const pdfFile = form.get("pdf");
  const pdf = pdfFile instanceof File && pdfFile.size > 0 ? pdfFile : null;
  if (pdf && (pdf.type !== "application/pdf" || pdf.size > 12 * 1024 * 1024)) {
    return NextResponse.json({ error: "Invoice PDF must be under 12 MB" }, { status: 400 });
  }
  const pdfTextRaw = form.get("pdfText");
  const pdfText = typeof pdfTextRaw === "string" ? pdfTextRaw.slice(0, 40000) : null;

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
  if (pdf) {
    const path = `drafts/${scanId}/original.pdf`;
    const { error: upErr } = await admin.storage
      .from(FOOD_BANK_BUCKET)
      .upload(path, Buffer.from(await pdf.arrayBuffer()), { contentType: "application/pdf" });
    if (upErr) return NextResponse.json({ error: `Couldn't save the invoice PDF: ${upErr.message}` }, { status: 500 });
    paths.push(path);
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
    const extracted = await extractFoodBankInvoice(dataUris, catalog, pdfText);
    // How this office's food bank wants the invoice split.
    const profiles = await loadOfficeFoodBanks(office.id);
    const profile = matchFoodBank(profiles, extracted.food_bank_name);
    const grantStatus = extracted.grant_credits.map((g) => ({ ref: g.ref, mapped: !!mappingFor(profile, g.ref, g.label) }));
    return NextResponse.json({
      scanId,
      paths,
      extracted,
      catalog,
      knownFoodBanks: Array.from(new Set([...profiles.map((p) => p.name), ...knownFoodBanks])),
      profiles: profiles.map((p) => ({ id: p.id, name: p.name, inkind_rule: p.inkind_rule, track_charges: p.track_charges, has_requestor: !!p.ticket_requestor_id })),
      profileId: profile?.id ?? null,
      grantStatus,
    });
  } catch (err: any) {
    await admin.storage.from(FOOD_BANK_BUCKET).remove(paths);
    return NextResponse.json({ error: err.message ?? "Couldn't read the invoice" }, { status: 502 });
  }
}
