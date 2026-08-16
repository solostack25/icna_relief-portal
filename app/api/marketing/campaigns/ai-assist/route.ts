import { NextResponse } from "next/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { callCopilotStudio } from "@/lib/copilotStudio";
import { newBlock, type EmailBlock } from "@/lib/emailBlocks";

const SYSTEM_INSTRUCTIONS = `You are helping draft a marketing/donor email for a nonprofit. Given the person's request, return ONLY a JSON array of content blocks, no other text, matching this shape:
[
  {"type": "heading", "text": "...", "align": "left"},
  {"type": "text", "text": "...", "align": "left"},
  {"type": "button", "label": "...", "url": "https://..."}
]
Valid types: heading, text, image (fields: imageUrl, alt), button (fields: label, url), divider, spacer (field: height). Keep it concise and donor-appropriate.`;

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { prompt } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const result = await callCopilotStudio(`${SYSTEM_INSTRUCTIONS}\n\nRequest: ${prompt}`, { feature: "email_builder" });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const blocks = parseBlocksLeniently(result.result);
  return NextResponse.json({ blocks });
}

function parseBlocksLeniently(raw: string): EmailBlock[] {
  try {
    // Copilot Studio flows sometimes wrap JSON in ```json fences or
    // add a sentence before/after - pull out just the array.
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");

    return parsed.map((b) => {
      const block = newBlock(b.type ?? "text");
      return { ...block, ...b, id: block.id };
    });
  } catch {
    // Fallback: at least hand back something editable rather than
    // erroring out - one text block with the raw response.
    const fallback = newBlock("text") as Extract<EmailBlock, { type: "text" }>;
    return [{ ...fallback, text: raw }];
  }
}
