import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { editImage, type ImageEditMode } from "@/lib/ai/imageEdit";

export const maxDuration = 120;

// AI Studio: Magic Erase / Generative Fill / Generative Expand.
// Body: { image, mask?, prompt?, mode: "fill" | "erase" | "expand", expand? }
export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json().catch(() => null);
  const image = body?.image as string | undefined;
  const mode = body?.mode as ImageEditMode | undefined;
  if (!image || !mode || !["fill", "erase", "expand"].includes(mode)) {
    return NextResponse.json({ error: "Expected 'image' and a 'mode' of fill, erase or expand." }, { status: 400 });
  }
  if (mode === "fill" && !String(body?.prompt ?? "").trim()) {
    return NextResponse.json({ error: "Describe what to paint into the selected area." }, { status: 400 });
  }
  try {
    const result = await editImage({
      image,
      mask: body?.mask ?? null,
      prompt: String(body?.prompt ?? ""),
      mode,
      expand: body?.expand,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI image edit hit an unexpected error." }, { status: 500 });
  }
}
