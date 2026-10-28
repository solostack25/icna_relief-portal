import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { ORG_APP_BASE_URL } from "@/lib/orgConfig";

// Saves a generated flier image as a flier_templates row: one locked
// full-bleed image on the canvas, so it opens in the Builder (for small
// edits layered on top) and in the Fill tool (download PNG/PDF). It's
// review_status 'pending' until marketing approves it for the gallery.
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const { requesterEmail, imageUrl, title, width, height, program } = body as { requesterEmail: string; imageUrl: string; title: string; width?: number; height?: number; program?: string };
  if (!requesterEmail?.trim() || !imageUrl?.trim() || !title?.trim()) return NextResponse.json({ error: "requesterEmail, imageUrl and title are required" }, { status: 400 });
  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) return NextResponse.json({ error: `No employee found with email ${requesterEmail}` }, { status: 404 });

  const w = Number(width) || 1024;
  const h = Number(height) || 1536;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("flier_templates")
    .insert({
      name: title.trim().slice(0, 80),
      category: "ai-generated",
      program: program ?? null,
      source: "ai-image",
      generated_image_url: imageUrl,
      review_status: "pending",
      is_active: true,
      canvas_width: w,
      canvas_height: h,
      canvas_background: "#FFFFFF",
      canvas_data: [
        {
          id: crypto.randomUUID(),
          type: "image",
          name: "AI flier",
          x: 0,
          y: 0,
          width: w,
          height: h,
          rotation: 0,
          opacity: 1,
          dropboxPath: null,
          imageUrl,
          editable: false,
          locked: true,
          maskShape: "rect",
          maskCornerRadius: 0,
          cropOffsetX: 0,
          cropOffsetY: 0,
          cropZoom: 1,
          filter: "none",
          brightness: 0,
          contrast: 0,
          blur: 0,
          saturation: 0,
          hue: 0,
          duotoneShadow: "#16302B",
          duotoneHighlight: "#C99A3D",
          borderWidth: 0,
          borderColor: "#16302B",
          shadow: false,
        },
      ],
      editable_element_ids: [],
      created_by: requester.id,
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not save the flier" }, { status: 500 });

  return NextResponse.json({
    templateId: data.id,
    downloadUrl: `${ORG_APP_BASE_URL}/fliers/${data.id}`,
    editorUrl: `${ORG_APP_BASE_URL}/admin/fliers/builder/${data.id}`,
    reviewStatus: "pending",
    note: "Saved. The employee can download it now from downloadUrl. It appears in the shared gallery for other offices once Marketing approves it.",
  });
}
