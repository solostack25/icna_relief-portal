import { NextResponse } from "next/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { generateBrandFliers, type FlierGenFormat } from "@/lib/ai/flierGenerate";

export const maxDuration = 300;

// Portal Assistant tool: paint 1-3 complete flier options with the image
// model, brand-gated. Returns public image URLs plus per-option checks so
// the assistant can show them and be honest about any that failed.
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const { requesterEmail, title, lines, program, subject, format, styleHint, quality, count } = body as {
    requesterEmail: string;
    title: string;
    lines?: string[];
    program?: string;
    subject?: string;
    format?: string;
    styleHint?: string;
    quality?: "draft" | "final";
    count?: number;
  };
  if (!requesterEmail?.trim() || !title?.trim()) return NextResponse.json({ error: "requesterEmail and title are required" }, { status: 400 });
  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) return NextResponse.json({ error: `No employee found with email ${requesterEmail}` }, { status: 404 });

  const fmt: FlierGenFormat = (["vertical", "square", "landscape", "story"] as const).includes(format as FlierGenFormat) ? (format as FlierGenFormat) : "vertical";
  try {
    const out = await generateBrandFliers({
      title: title.trim(),
      lines: Array.isArray(lines) ? lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 6) : [],
      program,
      subject,
      format: fmt,
      styleHint,
      quality: quality === "final" ? "final" : "draft",
      count: Math.max(1, Math.min(3, Number(count) || 2)),
    });
    return NextResponse.json({
      options: out.results.map((r, i) => ({ option: i + 1, ...r })),
      referenceFliersUsed: out.brandRefs,
      warnings: out.warnings,
      next: "Show each option to the employee as an image (markdown ![Option N](url)). When they pick one, call save_generated_flier with that option's url to save it as a flier they can download or open in the editor.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Flier generation failed." }, { status: 500 });
  }
}
