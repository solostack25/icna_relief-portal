import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { ORG_APP_BASE_URL } from "@/lib/orgConfig";
import { buildScratchFlierCanvas, buildPosterFlierCanvas, type FlierFormat, type InfoBlock } from "@/lib/flierScratchLayout";
import { searchStockPhotos } from "@/lib/pexels";
import { generateFlierBackgroundDataUri } from "@/lib/ai/azureOpenAI";

const VALID_FORMATS: FlierFormat[] = ["square", "vertical", "landscape", "story"];

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const {
    requesterEmail,
    title,
    subheadline,
    bodyText,
    footerText,
    format,
    style,
    infoBlocks,
    backgroundPhotoQuery,
    illustrationPrompt,
  } = body as {
    requesterEmail: string;
    title: string;
    subheadline?: string;
    bodyText?: string;
    footerText?: string;
    format?: string;
    style?: string;
    infoBlocks?: InfoBlock[];
    backgroundPhotoQuery?: string;
    illustrationPrompt?: string;
  };

  if (!requesterEmail?.trim() || !title?.trim()) {
    return NextResponse.json({ error: "requesterEmail and title are required" }, { status: 400 });
  }

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: `No employee found with email ${requesterEmail}` }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: guidelines } = await admin
    .from("brand_guidelines")
    .select("colors, fonts")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();

  const colors: { name: string; hex: string; usage?: string }[] = guidelines?.colors ?? [];
  const primaryColorHex = colors.find((c) => /strong green|corporate/i.test(c.usage ?? c.name))?.hex ?? "#00A950";
  const accentColorHex = colors.find((c) => /orange|corporate/i.test(c.usage ?? c.name) && c.hex !== primaryColorHex)?.hex ?? "#F28D1D";

  const fonts: { role: string; family: string }[] = guidelines?.fonts ?? [];
  const primaryFont = fonts.find((f) => /primary/i.test(f.role))?.family ?? "Avenir";

  const logoUrl = await getIntegrationSetting("brand_logo_url");
  const resolvedFormat = VALID_FORMATS.includes(format as FlierFormat) ? (format as FlierFormat) : "vertical";
  const resolvedStyle = style === "poster" ? "poster" : "simple";

  let warning: string | undefined;
  if (!logoUrl) {
    warning = "No logo asset is configured (Admin → Connectors → Brand Assets), so this flier was created without one. Add it in the builder before publishing.";
  }

  let layout;

  if (resolvedStyle === "poster") {
    let backgroundImageUrl: string | undefined;

    // AI-illustrated background takes priority over a stock photo when
    // requested — deliberately instructed to never render any text or
    // words: text accuracy in generated images is unreliable, and every
    // real word on this flier (title, dates, contact info) is added
    // afterward by the deterministic layout, not by this image. This is
    // the "learn our style" piece — the prompt is built from the actual
    // brand colors/voice, not left to the model's own assumptions.
    if (illustrationPrompt?.trim()) {
      try {
        const brandPrompt = `Flat vector illustration background for a nonprofit event flier, decorative only. Subject: ${illustrationPrompt.trim()}. Color palette: primarily ${primaryColorHex} and ${accentColorHex}, plus soft neutral tones. Clean, warm, modern nonprofit/community-service aesthetic — simple shapes, no photorealism, no clutter. CRITICAL: absolutely no text, no letters, no words, no numbers, no logos of any kind anywhere in the image — this is a background layer only, all text is added separately.`;
        backgroundImageUrl = await generateFlierBackgroundDataUri(brandPrompt, resolvedFormat === "landscape" ? "1792x1024" : "1024x1792");
      } catch (e) {
        warning = `${warning ? warning + " " : ""}Couldn't generate an AI background (${
          e instanceof Error ? e.message : "unknown error"
        }) — falling back to a stock photo or solid color instead.`;
      }
    }

    if (!backgroundImageUrl && backgroundPhotoQuery?.trim()) {
      try {
        const photos = await searchStockPhotos(backgroundPhotoQuery.trim());
        backgroundImageUrl = photos?.[0]?.fullUrl;
      } catch {
        // Pexels not configured or no results - falls back to a solid
        // brand-color background instead, handled inside buildPosterFlierCanvas.
      }
      if (!backgroundImageUrl) {
        warning = `${warning ? warning + " " : ""}No stock photo was found for "${backgroundPhotoQuery}", so this poster uses a solid brand-color background instead.`;
      }
    }

    layout = buildPosterFlierCanvas({
      title: title.trim(),
      subtitle: subheadline,
      infoBlocks: infoBlocks ?? [],
      footerText,
      format: resolvedFormat,
      backgroundImageUrl,
      primaryColorHex,
      accentColorHex,
      fontFamily: primaryFont,
      logoUrl: logoUrl ?? undefined,
    });
  } else {
    layout = buildScratchFlierCanvas({
      title: title.trim(),
      subheadline,
      bodyText,
      footerText,
      format: resolvedFormat,
      primaryColorHex,
      accentColorHex,
      fontFamily: primaryFont,
      logoUrl: logoUrl ?? undefined,
    });
  }

  const { data: created, error } = await admin
    .from("flier_templates")
    .insert({
      name: title.trim().slice(0, 80),
      category: "ai-generated",
      canvas_width: layout.canvasWidth,
      canvas_height: layout.canvasHeight,
      canvas_background: layout.canvasBackground,
      canvas_data: layout.canvasData,
      editable_element_ids: layout.editableElementIds,
      is_active: true,
      created_by: requester.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "Could not create the flier" }, { status: 500 });
  }

  return NextResponse.json({
    templateId: created.id,
    reviewUrl: `${ORG_APP_BASE_URL}/fliers/${created.id}`,
    ...(warning ? { warning } : {}),
  });
}
