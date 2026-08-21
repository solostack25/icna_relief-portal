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

export type InfoBlock = { label: string; value: string };

export type PosterFlierInput = {
  title: string;
  subtitle?: string; // e.g. "Backpack & Supplies Pick Up"
  infoBlocks: InfoBlock[]; // e.g. [{label: "Time & Date", value: "Sat, Aug 22 · 7-8:30 PM"}, ...] - max 4
  footerText?: string;
  format?: FlierFormat;
  backgroundImageUrl?: string; // full-bleed photo behind everything, if resolved
  primaryColorHex: string;
  accentColorHex: string;
  fontFamily: string;
  logoUrl?: string;
};

// Badge/poster style - closer to a real designed flier (photo or color-
// washed background, bold title, stacked colored info "badges" like
// Time & Date / Location / Contact). Same guarantee as the simple style:
// deterministic positioning using only rect/text/image, so it always
// renders correctly - the visual richness comes from real content
// (a real background photo, real brand colors) rather than trusting an
// LLM to invent coordinates or illustrated graphics, which isn't
// realistically achievable either way.
export function buildPosterFlierCanvas(input: PosterFlierInput) {
  const format = input.format ?? "vertical";
  const { width, height } = FORMAT_DIMENSIONS[format];
  const margin = Math.round(width * 0.07);
  const contentWidth = width - margin * 2;

  const elements: Record<string, unknown>[] = [];
  const editableElementIds: { id: string; type: string; label: string }[] = [];

  // Background: full-bleed photo if we have one, otherwise a solid
  // brand-color wash - never left blank/white, since this style is meant
  // to read as a real designed poster.
  if (input.backgroundImageUrl) {
    elements.push({
      id: crypto.randomUUID(),
      type: "image",
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      opacity: 1,
      editable: false,
      imageUrl: input.backgroundImageUrl,
    });
    // Dark overlay for text legibility over a photo.
    elements.push({
      id: crypto.randomUUID(),
      type: "rect",
      x: 0,
      y: 0,
      width,
      height,
      fill: "#000000",
      opacity: 0.38,
      rotation: 0,
      cornerRadius: 0,
      editable: false,
    });
  } else {
    elements.push({
      id: crypto.randomUUID(),
      type: "rect",
      x: 0,
      y: 0,
      width,
      height,
      fill: input.primaryColorHex,
      opacity: 1,
      rotation: 0,
      cornerRadius: 0,
      editable: false,
    });
  }

  const textColor = "#FFFFFF";
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
    cursorY += logoHeight + Math.round(logoHeight * 0.8);
  }

  const titleId = crypto.randomUUID();
  const titleFontSize = Math.round(width * 0.09);
  elements.push({
    id: titleId,
    type: "text",
    x: margin,
    y: cursorY,
    width: contentWidth,
    height: Math.round(titleFontSize * 2.6),
    text: input.title,
    align: "left",
    fill: textColor,
    fontFamily: input.fontFamily,
    fontSize: titleFontSize,
    fontStyle: "bold",
    lineHeight: 1.1,
    letterSpacing: 0,
    rotation: 0,
    opacity: 1,
    editable: true,
    editableLabel: "Headline",
  });
  editableElementIds.push({ id: titleId, type: "text", label: "Headline" });
  cursorY += Math.round(titleFontSize * 2.6);

  if (input.subtitle?.trim()) {
    const subId = crypto.randomUUID();
    const subFontSize = Math.round(width * 0.04);
    elements.push({
      id: subId,
      type: "text",
      x: margin,
      y: cursorY,
      width: contentWidth,
      height: Math.round(subFontSize * 1.6),
      text: input.subtitle.trim(),
      align: "left",
      fill: input.accentColorHex,
      fontFamily: input.fontFamily,
      fontSize: subFontSize,
      fontStyle: "bold",
      lineHeight: 1.2,
      letterSpacing: 0,
      rotation: 0,
      opacity: 1,
      editable: true,
      editableLabel: "Subtitle",
    });
    editableElementIds.push({ id: subId, type: "text", label: "Subtitle" });
    cursorY += Math.round(subFontSize * 1.8);
  }

  cursorY += Math.round(height * 0.05);

  // Info badges - orange label pill + white value bar, stacked, mirroring
  // the Time & Date / Location / Contact pattern from real ICNA Relief
  // fliers. Capped at 4 so the layout can't run off the bottom.
  const badgeLabelHeight = Math.round(height * 0.045);
  const badgeGap = Math.round(height * 0.015);
  const badgeFontSize = Math.round(width * 0.028);

  for (const block of input.infoBlocks.slice(0, 4)) {
    const labelId = crypto.randomUUID();
    elements.push({
      id: labelId,
      type: "rect",
      x: margin,
      y: cursorY,
      width: Math.round(contentWidth * 0.42),
      height: badgeLabelHeight,
      fill: input.accentColorHex,
      opacity: 1,
      rotation: 0,
      cornerRadius: 6,
      editable: false,
    });
    elements.push({
      id: crypto.randomUUID(),
      type: "text",
      x: margin + 14,
      y: cursorY + badgeLabelHeight / 2 - badgeFontSize / 1.6,
      width: Math.round(contentWidth * 0.42) - 28,
      height: badgeFontSize * 1.4,
      text: block.label,
      align: "left",
      fill: "#FFFFFF",
      fontFamily: input.fontFamily,
      fontSize: badgeFontSize,
      fontStyle: "bold",
      lineHeight: 1.2,
      letterSpacing: 0,
      rotation: 0,
      opacity: 1,
      editable: false,
    });

    const valueId = crypto.randomUUID();
    const valueX = margin + Math.round(contentWidth * 0.42) + 12;
    const valueWidth = contentWidth - Math.round(contentWidth * 0.42) - 12;
    elements.push({
      id: crypto.randomUUID(),
      type: "rect",
      x: valueX,
      y: cursorY,
      width: valueWidth,
      height: badgeLabelHeight,
      fill: "#FFFFFF",
      opacity: 0.95,
      rotation: 0,
      cornerRadius: 6,
      editable: false,
    });
    elements.push({
      id: valueId,
      type: "text",
      x: valueX + 12,
      y: cursorY + badgeLabelHeight / 2 - badgeFontSize / 1.6,
      width: valueWidth - 24,
      height: badgeFontSize * 1.4,
      text: block.value,
      align: "left",
      fill: "#1a1a1a",
      fontFamily: input.fontFamily,
      fontSize: badgeFontSize,
      fontStyle: "normal",
      lineHeight: 1.2,
      letterSpacing: 0,
      rotation: 0,
      opacity: 1,
      editable: true,
      editableLabel: block.label,
    });
    editableElementIds.push({ id: valueId, type: "text", label: block.label });

    cursorY += badgeLabelHeight + badgeGap;
  }

  // Footer band, full width, anchored to the bottom.
  const footerHeight = Math.round(height * 0.06);
  elements.push({
    id: crypto.randomUUID(),
    type: "rect",
    x: 0,
    y: height - footerHeight,
    width,
    height: footerHeight,
    fill: input.primaryColorHex,
    opacity: 0.92,
    rotation: 0,
    cornerRadius: 0,
    editable: false,
  });
  const footerId = crypto.randomUUID();
  const footerFontSize = Math.round(width * 0.022);
  elements.push({
    id: footerId,
    type: "text",
    x: margin,
    y: height - footerHeight / 2 - footerFontSize / 1.6,
    width: contentWidth,
    height: footerFontSize * 1.6,
    text: input.footerText?.trim() || DEFAULT_FOOTER,
    align: "left",
    fill: "#FFFFFF",
    fontFamily: input.fontFamily,
    fontSize: footerFontSize,
    fontStyle: "normal",
    lineHeight: 1.2,
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
