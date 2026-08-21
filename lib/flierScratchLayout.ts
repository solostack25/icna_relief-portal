// Builds a clean, single-column flier layout from plain content -
// deterministically, not via an LLM emitting raw canvas coordinates.
// The AI's job (see the Copilot route that calls this) is limited to
// writing the TEXT CONTENT following brand voice/terminology; this file
// owns positioning, sizing, and color/font selection, pulled directly
// from brand_guidelines. That split means every AI-generated flier is
// guaranteed to render correctly and stay on-brand, rather than being at
// the mercy of the model producing well-formed element JSON.

export type FlierFormat = "square" | "vertical" | "landscape" | "story";

const FORMAT_DIMENSIONS: Record<FlierFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  vertical: { width: 1080, height: 1350 },
  landscape: { width: 1080, height: 566 },
  story: { width: 1080, height: 1920 },
};

export type ScratchFlierInput = {
  title: string;
  subheadline?: string; // e.g. date/time/location, one line
  bodyText?: string;
  footerText?: string; // defaults to org contact info if omitted
  format?: FlierFormat;
  primaryColorHex: string; // brand corporate color, e.g. #00A950
  accentColorHex: string; // second brand corporate color, e.g. #F28D1D
  fontFamily: string; // brand primary font name, e.g. "Avenir"
  logoUrl?: string; // omitted entirely if not configured - never invented
};

const DEFAULT_FOOTER = "ICNA Relief USA  ·  icnarelief.org  ·  (866) 354-0102";

export function buildScratchFlierCanvas(input: ScratchFlierInput) {
  const format = input.format ?? "vertical";
  const { width, height } = FORMAT_DIMENSIONS[format];
  const margin = Math.round(width * 0.07);
  const contentWidth = width - margin * 2;

  const elements: Record<string, unknown>[] = [];
  const editableElementIds: { id: string; type: string; label: string }[] = [];
  let cursorY = margin;

  if (input.logoUrl) {
    const logoHeight = Math.round(height * 0.06);
    const logoWidth = Math.round(logoHeight * 3.1);
    elements.push({
      id: crypto.randomUUID(),
      type: "image",
      x: margin,
      y: cursorY,
      width: logoWidth,
      height: logoHeight,
      rotation: 0,
      opacity: 1,
      editable: false,
      imageUrl: input.logoUrl,
    });
    cursorY += logoHeight + Math.round(logoHeight / 2);
  }

  const barHeight = Math.max(6, Math.round(height * 0.006));
  elements.push({
    id: crypto.randomUUID(),
    type: "rect",
    x: margin,
    y: cursorY,
    width: contentWidth,
    height: barHeight,
    fill: input.accentColorHex,
    rotation: 0,
    opacity: 1,
    cornerRadius: barHeight / 2,
    editable: false,
  });
  cursorY += barHeight + Math.round(height * 0.035);

  const titleId = crypto.randomUUID();
  const titleFontSize = Math.round(width * 0.075);
  elements.push({
    id: titleId,
    type: "text",
    x: margin,
    y: cursorY,
    width: contentWidth,
    height: Math.round(titleFontSize * 2.4),
    text: input.title,
    align: "left",
    fill: input.primaryColorHex,
    fontFamily: input.fontFamily,
    fontSize: titleFontSize,
    fontStyle: "bold",
    lineHeight: 1.15,
    letterSpacing: 0,
    rotation: 0,
    opacity: 1,
    editable: true,
    editableLabel: "Headline",
  });
  editableElementIds.push({ id: titleId, type: "text", label: "Headline" });
  cursorY += Math.round(titleFontSize * 2.4) + Math.round(height * 0.02);

  if (input.subheadline?.trim()) {
    const subId = crypto.randomUUID();
    const subFontSize = Math.round(width * 0.032);
    elements.push({
      id: subId,
      type: "text",
      x: margin,
      y: cursorY,
      width: contentWidth,
      height: Math.round(subFontSize * 1.6),
      text: input.subheadline.trim(),
      align: "left",
      fill: input.accentColorHex,
      fontFamily: input.fontFamily,
      fontSize: subFontSize,
      fontStyle: "bold",
      lineHeight: 1.3,
      letterSpacing: 0,
      rotation: 0,
      opacity: 1,
      editable: true,
      editableLabel: "Date / Time / Location",
    });
    editableElementIds.push({ id: subId, type: "text", label: "Date / Time / Location" });
    cursorY += Math.round(subFontSize * 1.6) + Math.round(height * 0.03);
  }

  if (input.bodyText?.trim()) {
    const bodyId = crypto.randomUUID();
    const bodyFontSize = Math.round(width * 0.026);
    const bodyHeight = Math.round(height * 0.32);
    elements.push({
      id: bodyId,
      type: "text",
      x: margin,
      y: cursorY,
      width: contentWidth,
      height: bodyHeight,
      text: input.bodyText.trim(),
      align: "left",
      fill: "#333333",
      fontFamily: input.fontFamily,
      fontSize: bodyFontSize,
      fontStyle: "normal",
      lineHeight: 1.5,
      letterSpacing: 0,
      rotation: 0,
      opacity: 1,
      editable: true,
      editableLabel: "Body Text",
    });
    editableElementIds.push({ id: bodyId, type: "text", label: "Body Text" });
  }

  const footerId = crypto.randomUUID();
  const footerFontSize = Math.round(width * 0.02);
  elements.push({
    id: footerId,
    type: "text",
    x: margin,
    y: height - margin - footerFontSize * 1.4,
    width: contentWidth,
    height: Math.round(footerFontSize * 1.6),
    text: input.footerText?.trim() || DEFAULT_FOOTER,
    align: "left",
    fill: "#666666",
    fontFamily: input.fontFamily,
    fontSize: footerFontSize,
    fontStyle: "normal",
    lineHeight: 1.3,
    letterSpacing: 0,
    rotation: 0,
    opacity: 1,
    editable: true,
    editableLabel: "Footer / Contact Info",
  });
  editableElementIds.push({ id: footerId, type: "text", label: "Footer / Contact Info" });

  return {
    canvasWidth: width,
    canvasHeight: height,
    canvasBackground: "#FFFFFF",
    canvasData: elements,
    editableElementIds,
  };
}
