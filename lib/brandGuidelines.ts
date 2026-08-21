import { createAdminClient } from "@/lib/supabase/server";

const GUIDELINES_ID = "00000000-0000-0000-0000-000000000001";

// Single source of truth for "what does on-brand content look like" -
// reused by the email campaign ai-assist route, the flier-creation
// Copilot tool, and anything else that generates ICNA Relief-facing
// copy. Pulls from the same brand_guidelines row the admin form at
// /marketing/fliers (Brand Guidelines tab) edits, so updating it there
// (or re-uploading the source PDF) updates every AI feature at once.
export async function getBrandGuidelinesPromptContext(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("brand_guidelines").select("*").eq("id", GUIDELINES_ID).single();
  if (!data) return "";

  const parts: string[] = [];

  if (data.voice_tone) {
    parts.push(`VOICE & TONE:\n${data.voice_tone}`);
  }

  if (Array.isArray(data.colors) && data.colors.length > 0) {
    const list = data.colors.map((c: any) => `${c.name} (${c.hex})${c.usage ? ` - ${c.usage}` : ""}`).join(", ");
    parts.push(`BRAND COLORS (use only these for anything color-related, e.g. suggesting a hex code): ${list}`);
  }

  if (Array.isArray(data.fonts) && data.fonts.length > 0) {
    const primary = data.fonts.find((f: any) => /primary/i.test(f.role))?.family ?? data.fonts[0]?.family;
    if (primary) parts.push(`PRIMARY FONT: ${primary}`);
  }

  if (Array.isArray(data.dos) && data.dos.length > 0) {
    parts.push(`ALWAYS:\n${data.dos.map((d: string) => `- ${d}`).join("\n")}`);
  }

  if (Array.isArray(data.donts) && data.donts.length > 0) {
    parts.push(`NEVER:\n${data.donts.map((d: string) => `- ${d}`).join("\n")}`);
  }

  if (parts.length === 0) return "";

  return `--- ICNA Relief Brand Guidelines (follow these strictly in anything you write or generate) ---\n${parts.join("\n\n")}\n--- End brand guidelines ---`;
}
