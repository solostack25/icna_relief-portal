import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { describeImage, AzureContentFilterError } from "@/lib/ai/azureOpenAI";

// Alt text generation for accessibility/social posting. Unlike Magic Write
// or Brand check, this genuinely needs to see the image to be accurate -
// uses describeImage's vision-capable call rather than callAzureChat.

export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json().catch(() => null);
  const imageUrl = body?.imageUrl as string | undefined;
  if (!imageUrl?.trim()) {
    return NextResponse.json({ error: "Expected a non-empty 'imageUrl'." }, { status: 400 });
  }

  try {
    const altText = await describeImage(
      imageUrl.trim(),
      "Write a concise alt text description of this image for accessibility purposes, as it would be used on " +
        "a flyer for ICNA Relief (a nonprofit relief organization). One sentence, under 20 words, describe what's " +
        "literally visible - no editorializing, no 'image of' or 'photo of' prefix. Respond with ONLY the alt " +
        "text itself, nothing else."
    );
    return NextResponse.json({ altText: altText.trim() });
  } catch (err) {
    if (err instanceof AzureContentFilterError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Alt text generation hit an unexpected error." },
      { status: 500 }
    );
  }
}
