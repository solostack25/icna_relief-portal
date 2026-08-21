import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { ORG_APP_BASE_URL } from "@/lib/orgConfig";

type CanvasElement = {
  id: string;
  editable?: boolean;
  editableLabel?: string;
  type: string;
};

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { requesterEmail, templateName, textValues } = body as {
    requesterEmail: string;
    templateName: string;
    textValues: Record<string, string>;
  };

  if (!requesterEmail?.trim() || !templateName?.trim() || !textValues || Object.keys(textValues).length === 0) {
    return NextResponse.json({ error: "requesterEmail, templateName, and textValues are required" }, { status: 400 });
  }

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: `No employee found with email ${requesterEmail}` }, { status: 404 });
  }

  const admin = createAdminClient();

  // Fuzzy match on template name, same pattern as resolveTargetByName for
  // calls/texts - exact match wins outright, otherwise a partial match is
  // only auto-accepted if it's the single candidate; multiple partial
  // matches (or none) come back as an ambiguous_target-style error so the
  // model can ask the employee to clarify and retry with the exact name.
  const { data: templates } = await admin
    .from("flier_templates")
    .select("id, name, canvas_data")
    .eq("is_active", true);

  const all = templates ?? [];
  const exact = all.filter((t: { name: string }) => t.name.toLowerCase() === templateName.trim().toLowerCase());
  const partial = all.filter((t: { name: string }) => t.name.toLowerCase().includes(templateName.trim().toLowerCase()));
  const matches = exact.length === 1 ? exact : partial;

  if (matches.length === 0) {
    return NextResponse.json({
      error: "template_not_found",
      message: `No flier template matching "${templateName}" was found.`,
      candidates: all.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })),
    });
  }
  if (matches.length > 1) {
    return NextResponse.json({
      error: "ambiguous_target",
      message: `Multiple templates match "${templateName}" - ask which one they meant.`,
      candidates: matches.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })),
    });
  }

  const template = matches[0];
  const elements: CanvasElement[] = (template.canvas_data ?? []).filter((el: CanvasElement) => el.editable);

  // Match each provided text value to an element by its editableLabel
  // (case-insensitive) first, falling back to treating the key as a
  // literal element id - mirrors how the human-facing Flier Builder UI
  // labels these fields, so the model can use natural names like
  // "headline" rather than needing to know internal element ids.
  const resolvedValues: Record<string, string> = {};
  const unmatchedKeys: string[] = [];

  for (const [key, value] of Object.entries(textValues)) {
    const byLabel = elements.find((el) => el.editableLabel?.toLowerCase() === key.toLowerCase());
    const byId = elements.find((el) => el.id === key);
    const match = byLabel ?? byId;
    if (match) {
      resolvedValues[match.id] = value;
    } else {
      unmatchedKeys.push(key);
    }
  }

  if (Object.keys(resolvedValues).length === 0) {
    return NextResponse.json({
      error: "no_matching_fields",
      message: `None of the provided field names matched an editable field on "${template.name}".`,
      availableFields: elements.map((el) => el.editableLabel ?? el.id),
    });
  }

  const { data: draft, error } = await admin
    .from("flier_drafts")
    .insert({ template_id: template.id, values: resolvedValues, source: "copilot", created_by: requester.id })
    .select("id")
    .single();

  if (error || !draft) {
    return NextResponse.json({ error: error?.message ?? "Could not create draft" }, { status: 500 });
  }

  return NextResponse.json({
    draftId: draft.id,
    templateName: template.name,
    reviewUrl: `${ORG_APP_BASE_URL}/fliers/${template.id}?draft=${draft.id}`,
    ...(unmatchedKeys.length > 0 ? { warning: `These fields didn't match anything editable and were skipped: ${unmatchedKeys.join(", ")}` } : {}),
  });
}
