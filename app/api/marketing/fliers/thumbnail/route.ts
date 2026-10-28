import { NextResponse } from "next/server";
import sharp from "sharp";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { createClient } from "@/lib/supabase/server";

// Stores a small gallery thumbnail for a template. The Builder captures
// page 1 at save time and posts the PNG; we shrink it to ~360px wide so
// the gallery query stays light.
export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const body = await req.json().catch(() => null);
  const templateId = body?.templateId as string | undefined;
  const dataUrl = body?.dataUrl as string | undefined;
  if (!templateId || !dataUrl?.startsWith("data:image/")) return NextResponse.json({ error: "Expected templateId and a PNG dataUrl." }, { status: 400 });
  try {
    const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    const thumb = await sharp(buf).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    const thumbUrl = `data:image/jpeg;base64,${thumb.toString("base64")}`;
    const supabase = await createClient();
    const { error } = await supabase.from("flier_templates").update({ thumbnail_data_url: thumbUrl }).eq("id", templateId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Thumbnail failed." }, { status: 500 });
  }
}
