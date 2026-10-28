import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { callAzureChat, AzureContentFilterError } from "@/lib/ai/azureOpenAI";

// Translates every text element on a page in one call and returns
// { translations: { [elementId]: string } }. Layout isn't touched - the
// client swaps the text in place, and the user can nudge boxes that
// grew (Spanish runs ~20% longer than English; Arabic/Urdu are RTL and
// get align flipped client-side).
export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json().catch(() => null);
  const items = body?.items as { id: string; text: string }[] | undefined;
  const language = String(body?.language ?? "").trim();
  if (!Array.isArray(items) || items.length === 0 || !language) {
    return NextResponse.json({ error: "Expected 'items' and a target 'language'." }, { status: 400 });
  }

  try {
    const result = await callAzureChat([
      {
        role: "system",
        content:
          `You translate short flier copy for ICNA Relief USA, a Muslim-led humanitarian nonprofit, into ${language}. ` +
          `Keep proper nouns (ICNA Relief, program names, street addresses, phone numbers, URLs, dates and times) unchanged. ` +
          `Keep each translation about as short as the original so it still fits the flier. ` +
          `Respond with ONLY a JSON object mapping each id to its translated text, no commentary.`,
      },
      { role: "user", content: JSON.stringify(Object.fromEntries(items.map((i) => [i.id, i.text]))) },
    ]);
    const raw = result.message.content ?? "{}";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const translations = JSON.parse(json) as Record<string, string>;
    return NextResponse.json({ translations });
  } catch (err) {
    const status = err instanceof AzureContentFilterError ? 422 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Translation failed." }, { status });
  }
}
