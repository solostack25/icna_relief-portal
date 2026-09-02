import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describeImage, AzureContentFilterError } from "@/lib/ai/azureOpenAI";

// Generates copy-paste-ready captions, not an auto-publish - deliberately
// simpler than the read side (no Meta posting permissions/App Review
// needed, since nothing here calls Facebook/Instagram's actual publish
// API). Reuses describeImage's vision call rather than a new low-level
// function, same way Magic Write asks for structured JSON and parses it.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const imageDataUri = body?.imageDataUri as string | undefined;
  const description = body?.description as string | undefined;
  if (!imageDataUri || !description?.trim()) {
    return NextResponse.json({ error: "Expected an image and a description." }, { status: 400 });
  }

  try {
    const raw = await describeImage(
      imageDataUri,
      "You write social media captions for ICNA Relief, a nonprofit relief organization. Look at this image " +
        `and use this description of what it's for: "${description.trim()}". Write two captions: ` +
        "one for Facebook (warm, community-toned, can run a bit longer, a sentence or two, little to no hashtags) " +
        "and one for Instagram (punchier, shorter, line breaks are fine, end with 4-6 relevant hashtags). " +
        "Base both on what's actually visible in the image plus the description - don't invent details the image " +
        'doesn\'t show. Respond with ONLY JSON of the exact shape {"facebook": "...", "instagram": "..."}, ' +
        "nothing else - no markdown fences, no commentary."
    );

    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.facebook !== "string" || typeof parsed.instagram !== "string") {
      throw new Error("Model response was missing a caption.");
    }

    return NextResponse.json({ facebook: parsed.facebook, instagram: parsed.instagram });
  } catch (err) {
    if (err instanceof AzureContentFilterError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Caption generation hit an unexpected error." },
      { status: 500 }
    );
  }
}
