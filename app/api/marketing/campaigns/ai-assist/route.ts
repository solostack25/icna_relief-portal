import { NextResponse } from "next/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { callCopilotStudio } from "@/lib/copilotStudio";
import { newBlock, type EmailBlock, type ImageBlock } from "@/lib/emailBlocks";
import { searchStockPhotos } from "@/lib/pexels";
import { getBrandGuidelinesPromptContext } from "@/lib/brandGuidelines";

const SYSTEM_INSTRUCTIONS = `You are helping draft a marketing/donor email for a nonprofit. Given the person's request, return ONLY a JSON array of content blocks, no other text, matching this shape:
[
  {"type": "heading", "text": "...", "align": "left"},
  {"type": "text", "text": "...", "align": "left"},
  {"type": "image", "imageQuery": "a short stock-photo search phrase describing what should appear here, e.g. \\"volunteers packing food boxes\\"", "alt": "..."},
  {"type": "button", "label": "...", "url": "https://..."}
]
Valid types: heading, text, image (fields: imageQuery, alt - NOT imageUrl, you don't have real image URLs, a real photo will be searched for and inserted using imageQuery), button (fields: label, url), divider, spacer (field: height). Keep it concise and donor-appropriate.`;

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { prompt } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const brandGuidelines = await getBrandGuidelinesPromptContext();
  const fullInstructions = brandGuidelines ? `${SYSTEM_INSTRUCTIONS}\n\n${brandGuidelines}` : SYSTEM_INSTRUCTIONS;

  const result = await callCopilotStudio(`${fullInstructions}\n\nRequest: ${prompt}`, { feature: "email_builder" });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const blocks = parseBlocksLeniently(result.result);
  const resolved = await resolveImageBlocks(blocks);
  return NextResponse.json({ blocks: resolved });
}

// The model can't know real image URLs, so it's instructed to return an
// imageQuery search phrase instead - this resolves each one against
// Pexels (the same stock photo source the Flier Builder already uses)
// and fills in a real imageUrl, rather than leaving a fake or empty one
// for the person to notice and fix by hand.
async function resolveImageBlocks(blocks: EmailBlock[]): Promise<EmailBlock[]> {
  return Promise.all(
    blocks.map(async (block) => {
      if (block.type !== "image") return block;

      const query = (block as ImageBlock & { imageQuery?: string }).imageQuery;
      if (!query?.trim()) return block;

      try {
        const photos = await searchStockPhotos(query.trim());
        const first = photos?.[0];
        if (first) {
          return { ...block, imageUrl: first.fullUrl, alt: block.alt || query };
        }
      } catch {
        // Pexels not configured or search failed - leave the block as-is
        // (empty imageUrl) rather than failing the whole generation; the
        // person can still pick an image manually in the builder.
      }
      return block;
    })
  );
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
