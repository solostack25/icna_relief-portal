import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { removeBackground } from "@/lib/ai/removeBg";

export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json().catch(() => null);
  const imageUrl = body?.imageUrl as string | undefined;
  if (!imageUrl?.trim()) {
    return NextResponse.json({ error: "Expected a non-empty 'imageUrl'." }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await removeBackground(imageUrl.trim());
    // Returned as a data: URI (same choice as generateFlierBackgroundDataUri
    // in azureOpenAI.ts) so the client can preview and apply it in one step
    // without a separate hosting/upload round-trip.
    const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
    return NextResponse.json({ dataUri });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Background removal hit an unexpected error." },
      { status: 500 }
    );
  }
}
