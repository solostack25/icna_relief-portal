import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";

type CanvasElement = {
  id: string;
  type: "text" | "image" | "rect" | "circle" | "line" | "icon";
  editable?: boolean;
  editableLabel?: string;
};

export async function GET() {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const supabase = await createClient();
  const [{ data: templates, error }, { data: guidelines }] = await Promise.all([
    supabase
      .from("flier_templates")
      .select("id, name, category, canvas_width, canvas_height, canvas_data")
      .eq("is_active", true)
      .order("name"),
    supabase.from("brand_guidelines").select("colors, fonts, logo_usage_notes, voice_tone, dos, donts").eq("id", "00000000-0000-0000-0000-000000000001").single(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reduce each template down to just what an API caller needs to
  // decide "does this fit the request" and "what fields do I fill in" -
  // not the full scene graph, which is only meaningful to the canvas
  // editor itself.
  const summarized = (templates ?? []).map((t: { id: string; name: string; category: string | null; canvas_width: number; canvas_height: number; canvas_data: CanvasElement[] }) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    width: t.canvas_width,
    height: t.canvas_height,
    editableFields: (t.canvas_data ?? [])
      .filter((el) => el.editable)
      .map((el) => ({ elementId: el.id, type: el.type, label: el.editableLabel ?? el.id })),
  }));

  // brandGuidelines rides along here so a caller building a flier from
  // a request (e.g. a future Copilot action) gets its boundaries and
  // its template menu in a single call - colors/fonts/logo rules/voice
  // are the constraints; images still come only from the separate
  // approved-image search endpoint, never from this response.
  return NextResponse.json({ templates: summarized, brandGuidelines: guidelines ?? null });
}
