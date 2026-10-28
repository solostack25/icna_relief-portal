import { NextResponse } from "next/server";
import sharp from "sharp";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { createAdminClient } from "@/lib/supabase/server";

const GUIDELINES_ID = "00000000-0000-0000-0000-000000000001";

// Reference fliers for AI generation: marketing uploads 3-6 of its real
// fliers; they're stored in the flier-ai bucket and listed on the
// brand_guidelines row.
export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });
  const admin = createAdminClient();
  const { data: row } = await admin.from("brand_guidelines").select("reference_flier_urls").eq("id", GUIDELINES_ID).maybeSingle();
  const urls: string[] = Array.isArray(row?.reference_flier_urls) ? row!.reference_flier_urls : [];
  for (const f of files.slice(0, 6)) {
    const buf = Buffer.from(await f.arrayBuffer());
    const png = await sharp(buf).resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const key = `references/${Date.now()}-${f.name.replace(/[^a-z0-9.]+/gi, "-").toLowerCase()}.png`;
    const { error } = await admin.storage.from("flier-ai").upload(key, png, { contentType: "image/png", upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    urls.push(admin.storage.from("flier-ai").getPublicUrl(key).data.publicUrl);
  }
  const { error } = await admin.from("brand_guidelines").update({ reference_flier_urls: urls.slice(-6), updated_by: access.employeeId, updated_at: new Date().toISOString() }).eq("id", GUIDELINES_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ urls: urls.slice(-6) });
}

export async function DELETE(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: row } = await admin.from("brand_guidelines").select("reference_flier_urls").eq("id", GUIDELINES_ID).maybeSingle();
  const urls: string[] = (Array.isArray(row?.reference_flier_urls) ? row!.reference_flier_urls : []).filter((u: string) => u !== url);
  await admin.from("brand_guidelines").update({ reference_flier_urls: urls, updated_at: new Date().toISOString() }).eq("id", GUIDELINES_ID);
  const key = url.split("/flier-ai/")[1];
  if (key) await admin.storage.from("flier-ai").remove([decodeURIComponent(key)]);
  return NextResponse.json({ urls });
}
