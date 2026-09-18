import { NextRequest, NextResponse } from "next/server";
import bwipjs from "bwip-js/node";
import { getOrlandoAutomationAccess } from "@/lib/orlandoAutomation/access";

export const dynamic = "force-dynamic";

// Renders the food bank's QR (from its encoded value) as a PNG for the
// Live Distribution scan modal. Server-side via bwip-js, same library the
// InKind barcode sheet already uses, so no browser QR library is needed.
export async function GET(req: NextRequest) {
  const access = await getOrlandoAutomationAccess();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  const text = req.nextUrl.searchParams.get("text");
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  try {
    const png = await bwipjs.toBuffer({ bcid: "qrcode", text, scale: 8, paddingwidth: 4, paddingheight: 4, backgroundcolor: "FFFFFF" });
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't render QR" }, { status: 400 });
  }
}
