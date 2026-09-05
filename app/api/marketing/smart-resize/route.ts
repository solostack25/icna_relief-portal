import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { callAzureChat, AzureContentFilterError } from "@/lib/ai/azureOpenAI";

// The existing plain resize (resizeElementsToCanvas in lib/flierElements.ts)
// uniformly scales everything and letterboxes - fine when the new aspect
// ratio is close to the old one, but going from a portrait flyer to a much
// taller Instagram Story (or a much wider banner) leaves big empty margins
// instead of actually reflowing content to use the new shape. This asks
// the model to propose a genuinely repositioned layout instead.
//
// Deliberately kept as an alternative next to the plain resize, not a
// replacement - LLM spatial reasoning over raw coordinates is inherently
// less reliable than deterministic scaling math, so the client falls back
// to the plain resize if this returns anything malformed or fails outright.

type SimplifiedElement = { id: string; type: string; x: number; y: number; width: number; height: number; text?: string };

export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json().catch(() => null);
  const elements = body?.elements as SimplifiedElement[] | undefined;
  const oldWidth = body?.oldWidth as number | undefined;
  const oldHeight = body?.oldHeight as number | undefined;
  const newWidth = body?.newWidth as number | undefined;
  const newHeight = body?.newHeight as number | undefined;

  if (!Array.isArray(elements) || elements.length === 0 || !oldWidth || !oldHeight || !newWidth || !newHeight) {
    return NextResponse.json({ error: "Expected elements, oldWidth, oldHeight, newWidth, newHeight." }, { status: 400 });
  }

  try {
    const result = await callAzureChat([
      {
        role: "system",
        content:
          "You are a layout assistant for a flyer design tool. You'll be given a list of elements with their " +
          "current x/y/width/height on a canvas of one size, and a NEW canvas size. Propose a new x/y/width/height " +
          "for EVERY element so the design makes good use of the new aspect ratio, instead of just being scaled " +
          "down with empty margins. Guidelines: preserve each element's relative reading order and relative size " +
          "importance (bigger/bolder elements should stay prominent); for a much taller/narrower new canvas, favor " +
          "stacking elements vertically; for a much wider/shorter one, favor spreading them horizontally; keep " +
          "every element fully within [0,0] to [newWidth,newHeight]; avoid overlapping elements where reasonably " +
          "possible. Respond with ONLY JSON of the exact shape " +
          '{"layout":[{"id":"...","x":0,"y":0,"width":0,"height":0}, ...]} covering every given element id, ' +
          "nothing else - no markdown fences, no commentary.",
      },
      {
        role: "user",
        content: JSON.stringify({ oldWidth, oldHeight, newWidth, newHeight, elements }),
      },
    ]);

    const raw = (result.message.content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(raw);
    const layout = parsed?.layout;
    if (!Array.isArray(layout)) throw new Error("Model response didn't include a 'layout' array.");

    const cleaned = layout
      .filter(
        (l: any) =>
          l && typeof l.id === "string" &&
          Number.isFinite(l.x) && Number.isFinite(l.y) &&
          Number.isFinite(l.width) && Number.isFinite(l.height) &&
          l.width > 0 && l.height > 0
      )
      .map((l: any) => ({
        id: l.id,
        // Clamp defensively - a model-proposed layout landing slightly
        // outside the canvas is a UX annoyance, not worth failing over.
        x: Math.max(0, Math.min(l.x, newWidth)),
        y: Math.max(0, Math.min(l.y, newHeight)),
        width: Math.max(1, Math.min(l.width, newWidth)),
        height: Math.max(1, Math.min(l.height, newHeight)),
      }));

    if (cleaned.length === 0) throw new Error("Model response had no usable layout entries.");

    return NextResponse.json({ layout: cleaned });
  } catch (err) {
    if (err instanceof AzureContentFilterError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Smart resize hit an unexpected error." },
      { status: 500 }
    );
  }
}
