import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { searchStockPhotos } from "@/lib/pexels";

// Marketing-only, on purpose - stock photos are for BUILDING templates,
// not for the fill tool. Field offices still only ever pick from the
// marketing-approved image library, preserving the same brand control
// as everything else in this tool.
export async function GET(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  if (!query || query.trim().length < 2) return NextResponse.json({ photos: [] });

  try {
    const photos = await searchStockPhotos(query.trim());
    return NextResponse.json({ photos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
