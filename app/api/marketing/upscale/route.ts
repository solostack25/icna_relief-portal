import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { upscaleImage } from "@/lib/ai/imageEdit";

export const maxDuration = 60;

export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const body = await req.json().catch(() => null);
  const image = body?.image as string | undefined;
  const factor = Number(body?.factor) === 4 ? 4 : 2;
  if (!image) return NextResponse.json({ error: "Expected 'image'." }, { status: 400 });
  try {
    return NextResponse.json(await upscaleImage(image, factor));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upscale failed." }, { status: 500 });
  }
}
