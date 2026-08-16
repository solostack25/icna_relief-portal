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
  const { data: templates, error } = await supabase
    .from("flier_templates")
    .select("id, name, category, canvas_width, canvas_height, canvas_data")
    .eq("is_active", true)
    .order("name");

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

  return NextResponse.json({ templates: summarized });
}
