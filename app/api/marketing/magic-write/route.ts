import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { callAzureChat, AzureContentFilterError } from "@/lib/ai/azureOpenAI";

// "Magic Write" for the flier builder's Text panel - short flyer-copy
// suggestions from a plain-language prompt ("blood drive next Saturday").
// Text-only Azure OpenAI call (cheapest AI feature to add - no image/
// vision cost), gated the same way every other flier-builder marketing
// endpoint is.

export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json().catch(() => null);
  const prompt = body?.prompt as string | undefined;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Expected a non-empty 'prompt'." }, { status: 400 });
  }

  try {
    const result = await callAzureChat([
      {
        role: "system",
        content:
          "You write short, punchy flyer copy for ICNA Relief, a nonprofit relief organization. " +
          "Given a brief description of what a flyer is for, return exactly 3 short text suggestions " +
          "(each under 12 words, no quotation marks, no trailing period) that could be used as a " +
          "headline or callout on the flyer. Respond with ONLY a JSON array of 3 strings, nothing else - " +
          "no markdown fences, no commentary.",
      },
      { role: "user", content: prompt.trim() },
    ]);

    const raw = result.message.content ?? "[]";
    let suggestions: string[];
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      const parsed = JSON.parse(cleaned);
      suggestions = Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
    } catch {
      // Model didn't return clean JSON - fall back to splitting lines
      // rather than failing the whole request over a formatting slip.
      suggestions = raw
        .split("\n")
        .map((line) => line.replace(/^[-*\d.)\s"]+/, "").replace(/"$/, "").trim())
        .filter(Boolean)
        .slice(0, 3);
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ error: "Magic Write didn't return any suggestions - try rephrasing the prompt." }, { status: 502 });
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 3) });
  } catch (err) {
    if (err instanceof AzureContentFilterError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Magic Write hit an unexpected error." },
      { status: 500 }
    );
  }
}
