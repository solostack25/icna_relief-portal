import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { ORG_APP_BASE_URL } from "@/lib/orgConfig";

type PrefillValue = string | { imageUrl: string; dropboxPath?: string };

export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const { templateId, values, source } = body as { templateId: string; values: Record<string, PrefillValue>; source?: "api" | "copilot" };

  if (!templateId || !values || Object.keys(values).length === 0) {
    return NextResponse.json({ error: "templateId and values are required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: template } = await supabase
    .from("flier_templates")
    .select("id, canvas_data")
    .eq("id", templateId)
    .eq("is_active", true)
    .single();
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Only accept values for elements that are actually marked editable
  // on this template - a caller can't smuggle in changes to brand-
  // locked elements (fonts, colors, logo placement) through this path.
  const editableIds = new Set(
    (template.canvas_data ?? []).filter((el: { editable?: boolean; id: string }) => el.editable).map((el: { id: string }) => el.id)
  );
  const filteredValues = Object.fromEntries(Object.entries(values).filter(([elementId]) => editableIds.has(elementId)));

  if (Object.keys(filteredValues).length === 0) {
    return NextResponse.json({ error: "None of the provided elementIds are editable fields on this template" }, { status: 400 });
  }

  const { data: draft, error } = await supabase
    .from("flier_drafts")
    .insert({ template_id: templateId, values: filteredValues, source: source ?? "api", created_by: access.employeeId })
    .select("id")
    .single();

  if (error || !draft) return NextResponse.json({ error: error?.message ?? "Could not create draft" }, { status: 500 });

  return NextResponse.json({
    draftId: draft.id,
    reviewUrl: `${ORG_APP_BASE_URL}/fliers/${templateId}?draft=${draft.id}`,
  });
}
