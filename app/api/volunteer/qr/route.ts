import { NextRequest, NextResponse } from "next/server";
import bwipjs from "bwip-js/node";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/volunteerServer";

export const dynamic = "force-dynamic";

// GET /api/volunteer/qr?event=<id>&kind=signup|checkin[&download=1]
//
// Staff-only PNG of an event's QR code. Visibility goes through the
// caller's RLS (they can only render codes for events they can see), and
// the check-in token never leaves the server except inside the image.
//   signup  → /volunteer/public/<slug>?src=qr          (share anywhere)
//   checkin → /volunteer/public/<slug>/checkin?t=<tok> (post on-site only)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = req.nextUrl.searchParams.get("event");
  const kind = req.nextUrl.searchParams.get("kind") === "checkin" ? "checkin" : "signup";
  if (!eventId) return NextResponse.json({ error: "event is required" }, { status: 400 });

  const { data: event } = await supabase
    .from("volunteer_events")
    .select("slug, checkin_token")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base = siteUrl(req.nextUrl.origin);
  const url =
    kind === "checkin"
      ? `${base}/volunteer/public/${event.slug}/checkin?t=${event.checkin_token}`
      : `${base}/volunteer/public/${event.slug}?src=qr`;

  const png = await bwipjs.toBuffer({
    bcid: "qrcode",
    text: url,
    scale: 10,
    paddingwidth: 4,
    paddingheight: 4,
    backgroundcolor: "FFFFFF",
  });

  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "private, no-store",
  };
  if (req.nextUrl.searchParams.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="${event.slug}-${kind}-qr.png"`;
  }
  return new NextResponse(new Uint8Array(png), { headers });
}
