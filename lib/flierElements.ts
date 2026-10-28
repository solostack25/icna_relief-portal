// Shared between the Builder (marketing, full editing) and the Fill
// tool (field offices, only editable elements are interactive) - one
// scene-graph format for both, matching how it's persisted in
// flier_templates.canvas_data.

// Fields every element type may carry (all optional so templates saved
// before Builder 2.0 keep loading unchanged):
//   locked  - can't be selected/moved on the canvas (still renders)
//   groupId - elements sharing a groupId move/select together
//   name    - friendly layer-panel label ("Header band") instead of the type
export type FlierElementBase = {
  locked?: boolean;
  groupId?: string;
  name?: string;
};

export type TextEffect = "none" | "shadow" | "outline" | "glow" | "background" | "curve";

export type FlierTextElement = FlierElementBase & {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  fontStyle: "normal" | "bold" | "italic" | "bold italic";
  align: "left" | "center" | "right";
  letterSpacing: number;
  lineHeight: number;
  editable: boolean;
  editableLabel?: string;
  // Text effects (Builder 2.0). effectColor doubles as the shadow/outline/
  // glow/background color; effectStrength is 0..100 and maps to blur/
  // offset/stroke width depending on the effect; curveRadius (px, in
  // canvas units) bends the text along an arc when effect === "curve".
  textEffect?: TextEffect;
  effectColor?: string;
  effectStrength?: number;
  curveRadius?: number;
};

export type FlierImageElement = FlierElementBase & {
  id: string;
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  dropboxPath: string | null;
  imageUrl: string | null;
  editable: boolean;
  editableLabel?: string;
  altText?: string; // accessibility description, optional - see Edit image panel's "Generate alt text"
  // Shape masking - "merge a square photo into a circle" and similar.
  maskShape: "rect" | "circle" | "rounded";
  maskCornerRadius: number; // used when maskShape === "rounded"
  // Reposition/zoom the source image within its fixed frame, expressed
  // as bounded slider values rather than freeform drag-to-pan - simpler
  // UI, still gets the "adjust how the photo sits in frame" result.
  // cropOffsetX/Y: -1..1 (pan), cropZoom: 1..3 (1 = just covers the frame).
  cropOffsetX: number;
  cropOffsetY: number;
  cropZoom: number;
  // Photoshop-style filters, applied via Konva's native filter pipeline.
  filter: "none" | "grayscale" | "sepia" | "invert" | "posterize" | "duotone";
  brightness: number; // -1..1
  contrast: number; // -100..100 (Konva's Contrast filter range)
  blur: number; // 0..20
  saturation: number; // -2..2 (Konva's HSL filter saturation range)
  hue: number; // 0..360 (Konva's HSL filter hue range)
  duotoneShadow: string; // hex, used when filter === "duotone"
  duotoneHighlight: string; // hex, used when filter === "duotone"
  // Border + shadow, shared styling concept across shapes/images.
  borderWidth: number;
  borderColor: string;
  shadow: boolean;
  // Builder 2.0 photo tools (all optional / default off)
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "soft-light";
  overlayColor?: string; // color overlay drawn above the photo, inside the mask
  overlayOpacity?: number; // 0..1
  warmth?: number; // -50..50 (negative = cooler/blue, positive = warmer/gold)
  vignette?: number; // 0..100
  flipX?: boolean;
  flipY?: boolean;
  naturalWidth?: number; // recorded on load, used by preflight to flag low-res photos
  naturalHeight?: number;
};

export type GradientProps = {
  enabled: boolean;
  from: string;
  to: string;
  direction: "horizontal" | "vertical" | "diagonal";
};

export const defaultGradient = (): GradientProps => ({
  enabled: false,
  from: "#1F6F54",
  to: "#C99A3D",
  direction: "diagonal",
});

export type FlierRectElement = FlierElementBase & {
  id: string;
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  gradient: GradientProps;
  cornerRadius: number;
  borderWidth: number;
  borderColor: string;
  shadow: boolean;
  editable: false;
};

export type FlierCircleElement = FlierElementBase & {
  id: string;
  type: "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  gradient: GradientProps;
  borderWidth: number;
  borderColor: string;
  shadow: boolean;
  editable: false;
};

export type FlierLineElement = FlierElementBase & {
  id: string;
  type: "line";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  editable: false;
};

export type FlierStarElement = FlierElementBase & {
  id: string;
  type: "star";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  numPoints: number;
  editable: false;
};

export type FlierPolygonElement = FlierElementBase & {
  id: string;
  type: "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  sides: number;
  editable: false;
};

export type FlierArrowElement = FlierElementBase & {
  id: string;
  type: "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  editable: false;
};

// Vector "sticker" icons (arrows, stars, badges, etc.) - a fixed SVG
// path drawn at whatever fill color is chosen, scaled to fit width/
// height. Distinct from the Star/Polygon/Arrow shape primitives above -
// those are geometric Konva shapes; icons are arbitrary path data from
// the curated set in lib/flierIcons.ts.
export type FlierIconElement = FlierElementBase & {
  id: string;
  type: "icon";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  iconId: string; // key into ICON_LIBRARY
  editable: false;
};

export type FlierElement =
  | FlierTextElement
  | FlierImageElement
  | FlierRectElement
  | FlierCircleElement
  | FlierLineElement
  | FlierStarElement
  | FlierPolygonElement
  | FlierArrowElement
  | FlierIconElement;

// Curated brand choices, not a free color/font picker for offices -
// admin-configurable via integration_settings-style pattern would be a
// reasonable follow-up, but starting with the portal's own established
// brand identity (emerald/gold palette, Fraunces/Manrope) so there's a
// real, working default rather than blocking on a separate settings build.
export const BRAND_FONTS = ["Manrope", "Fraunces", "IBM Plex Mono"];
export const BRAND_COLORS = ["#16302B", "#1F6F54", "#C99A3D", "#FBF7EF", "#FFFFFF", "#3E7C9A", "#B55139"];

// Broader font library for the Text panel's font list, beyond the 3 brand
// fonts above (which stay first/pinned as "Brand"). Loaded via the Google
// Fonts @import in globals.css - every family here must have a matching
// entry there or it'll silently fall back to a system font on canvas.
export type FontEntry = { family: string; category: "Brand" | "Script" | "Display" | "Serif" | "Sans" };
export const FONT_LIBRARY: FontEntry[] = [
  { family: "Manrope", category: "Brand" },
  { family: "Fraunces", category: "Brand" },
  { family: "IBM Plex Mono", category: "Brand" },
  { family: "Pacifico", category: "Script" },
  { family: "Dancing Script", category: "Script" },
  { family: "Caveat", category: "Script" },
  { family: "Permanent Marker", category: "Script" },
  { family: "Sacramento", category: "Script" },
  { family: "Bebas Neue", category: "Display" },
  { family: "Anton", category: "Display" },
  { family: "Righteous", category: "Display" },
  { family: "Passion One", category: "Display" },
  { family: "Alfa Slab One", category: "Display" },
  { family: "Playfair Display", category: "Serif" },
  { family: "Abril Fatface", category: "Serif" },
  { family: "Cormorant Garamond", category: "Serif" },
  { family: "Poppins", category: "Sans" },
  { family: "Montserrat", category: "Sans" },
  { family: "Oswald", category: "Sans" },
  { family: "Raleway", category: "Sans" },
  { family: "Work Sans", category: "Sans" },
];

export type SizePreset = { label: string; width: number; height: number; group: string };

export const CANVAS_SIZE_PRESETS: SizePreset[] = [
  { label: "Flier (Print)", width: 1080, height: 1350, group: "Print" },
  { label: "US Letter Poster", width: 850, height: 1100, group: "Print" },

  { label: "Instagram Feed (Portrait)", width: 1080, height: 1350, group: "Instagram" },
  { label: "Instagram Feed (Square)", width: 1080, height: 1080, group: "Instagram" },
  { label: "Instagram Story / Reel", width: 1080, height: 1920, group: "Instagram" },

  { label: "Facebook Post", width: 1200, height: 630, group: "Facebook" },
  { label: "Facebook Cover", width: 851, height: 315, group: "Facebook" },
  { label: "Facebook Story", width: 1080, height: 1920, group: "Facebook" },

  { label: "LinkedIn Post", width: 1200, height: 1200, group: "LinkedIn" },
  { label: "LinkedIn Company Cover", width: 1128, height: 191, group: "LinkedIn" },

  { label: "YouTube Thumbnail", width: 1280, height: 720, group: "YouTube" },
  { label: "YouTube Channel Banner", width: 2560, height: 1440, group: "YouTube" },

  { label: "TikTok Post", width: 1080, height: 1920, group: "TikTok" },

  { label: "Pinterest Pin", width: 1000, height: 1500, group: "Pinterest" },

  { label: "X / Twitter Post", width: 1600, height: 900, group: "X / Twitter" },
  { label: "X / Twitter Header", width: 1500, height: 500, group: "X / Twitter" },
];

// Proportional resize: scales every element by the SAME factor (the
// smaller of the two axis ratios, so nothing overflows or distorts),
// then re-centers the scaled content in the new canvas. Distinct from
// just changing canvas_width/height directly (which is for starting a
// blank template at a given size) - this is for taking an EXISTING
// design and adapting it to a different platform's dimensions as a
// real starting point, not a from-scratch redo.
export type BrandCheckResult = { offBrandFonts: string[]; offBrandColors: string[] };

// Deterministic, not an AI call - "off-brand" here just means "not one of
// the exact fonts/colors in BRAND_FONTS / BRAND_COLORS", which is a plain
// set-membership check. An LLM call would add latency, cost, and a failure
// mode for something a string/hex comparison already answers instantly and
// for free - the "AI" in "AI features" doesn't have to mean every feature
// routes through a model, just that this is part of that same feature set.
export function checkBrandConsistency(elements: FlierElement[], background: string): BrandCheckResult {
  const fontsInUse = new Set<string>();
  const colorsInUse = new Set<string>();

  const addColor = (c: unknown) => {
    if (typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c)) colorsInUse.add(c.toUpperCase());
  };

  addColor(background);
  for (const el of elements) {
    if (el.type === "text") {
      fontsInUse.add(el.fontFamily);
      addColor(el.fill);
    } else if (el.type === "image") {
      if (el.filter === "duotone") {
        addColor(el.duotoneShadow);
        addColor(el.duotoneHighlight);
      }
      if (el.borderWidth > 0) addColor(el.borderColor);
    } else if (el.type === "rect" || el.type === "circle") {
      addColor(el.fill);
      if (el.gradient.enabled) {
        addColor(el.gradient.from);
        addColor(el.gradient.to);
      }
      if (el.borderWidth > 0) addColor(el.borderColor);
    } else if (el.type === "line") {
      addColor(el.stroke);
    } else if (el.type === "star" || el.type === "polygon" || el.type === "arrow" || el.type === "icon") {
      addColor((el as any).fill);
    }
  }

  const brandFontsUpper = new Set(BRAND_FONTS.map((f) => f.toUpperCase()));
  const brandColorsUpper = new Set(BRAND_COLORS.map((c) => c.toUpperCase()));

  return {
    offBrandFonts: [...fontsInUse].filter((f) => !brandFontsUpper.has(f.toUpperCase())).sort(),
    offBrandColors: [...colorsInUse].filter((c) => !brandColorsUpper.has(c)).sort(),
  };
}

export function resizeElementsToCanvas(
  elements: FlierElement[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number
): FlierElement[] {
  const scale = Math.min(newWidth / oldWidth, newHeight / oldHeight);
  const offsetX = (newWidth - oldWidth * scale) / 2;
  const offsetY = (newHeight - oldHeight * scale) / 2;
  return elements.map((el) => {
    const scaled: any = {
      ...el,
      x: el.x * scale + offsetX,
      y: el.y * scale + offsetY,
      width: el.width * scale,
      height: el.height * scale,
    };
    if (el.type === "text") scaled.fontSize = Math.max(6, Math.round(el.fontSize * scale));
    if (el.type === "line") scaled.strokeWidth = Math.max(1, el.strokeWidth * scale);
    if (el.type === "rect") scaled.cornerRadius = el.cornerRadius * scale;
    return scaled as FlierElement;
  });
}

export function newTextElement(overrides: Partial<FlierTextElement> = {}): FlierTextElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    x: 60,
    y: 60,
    width: 400,
    height: 60,
    rotation: 0,
    opacity: 1,
    text: "Edit this text",
    fontFamily: "Manrope",
    fontSize: 32,
    fill: "#16302B",
    fontStyle: "normal",
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.2,
    editable: false,
    ...overrides,
  };
}

export function newImageElement(overrides: Partial<FlierImageElement> = {}): FlierImageElement {
  return {
    id: crypto.randomUUID(),
    type: "image",
    x: 60,
    y: 60,
    width: 300,
    height: 300,
    rotation: 0,
    opacity: 1,
    dropboxPath: null,
    imageUrl: null,
    editable: false,
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
    ...overrides,
  };
}

export function newRectElement(overrides: Partial<FlierRectElement> = {}): FlierRectElement {
  return {
    id: crypto.randomUUID(),
    type: "rect",
    x: 0,
    y: 0,
    width: 300,
    height: 100,
    rotation: 0,
    opacity: 1,
    fill: "#1F6F54",
    gradient: defaultGradient(),
    cornerRadius: 0,
    borderWidth: 0,
    borderColor: "#16302B",
    shadow: false,
    editable: false,
    ...overrides,
  };
}

export function newCircleElement(overrides: Partial<FlierCircleElement> = {}): FlierCircleElement {
  return {
    id: crypto.randomUUID(),
    type: "circle",
    x: 60,
    y: 60,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    fill: "#C99A3D",
    gradient: defaultGradient(),
    borderWidth: 0,
    borderColor: "#16302B",
    shadow: false,
    editable: false,
    ...overrides,
  };
}

export function newLineElement(overrides: Partial<FlierLineElement> = {}): FlierLineElement {
  return {
    id: crypto.randomUUID(),
    type: "line",
    x: 60,
    y: 60,
    width: 300,
    height: 0,
    rotation: 0,
    opacity: 1,
    stroke: "#16302B",
    strokeWidth: 3,
    editable: false,
    ...overrides,
  };
}

export function newStarElement(overrides: Partial<FlierStarElement> = {}): FlierStarElement {
  return {
    id: crypto.randomUUID(),
    type: "star",
    x: 60,
    y: 60,
    width: 180,
    height: 180,
    rotation: 0,
    opacity: 1,
    fill: "#C99A3D",
    numPoints: 5,
    editable: false,
    ...overrides,
  };
}

export function newPolygonElement(overrides: Partial<FlierPolygonElement> = {}): FlierPolygonElement {
  return {
    id: crypto.randomUUID(),
    type: "polygon",
    x: 60,
    y: 60,
    width: 180,
    height: 180,
    rotation: 0,
    opacity: 1,
    fill: "#1F6F54",
    sides: 6,
    editable: false,
    ...overrides,
  };
}

export function newArrowElement(overrides: Partial<FlierArrowElement> = {}): FlierArrowElement {
  return {
    id: crypto.randomUUID(),
    type: "arrow",
    x: 60,
    y: 60,
    width: 220,
    height: 40,
    rotation: 0,
    opacity: 1,
    fill: "#16302B",
    editable: false,
    ...overrides,
  };
}

export function newIconElement(iconId: string, overrides: Partial<FlierIconElement> = {}): FlierIconElement {
  return {
    id: crypto.randomUUID(),
    type: "icon",
    x: 60,
    y: 60,
    width: 80,
    height: 80,
    rotation: 0,
    opacity: 1,
    fill: "#1F6F54",
    iconId,
    editable: false,
    ...overrides,
  };
}

// "object-fit: cover" math, parameterized by a bounded zoom + pan so the
// Builder can expose this as sliders instead of freeform drag-to-pan -
// simpler UI, still gets a real "reposition the photo within its frame"
// result. Returns a Konva `crop` rect in source-image pixel space.
export function computeCoverCrop(
  naturalWidth: number,
  naturalHeight: number,
  frameWidth: number,
  frameHeight: number,
  zoom: number,
  offsetX: number,
  offsetY: number
) {
  const baseScale = Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight);
  const scale = baseScale * Math.max(1, zoom);
  const cropWidth = Math.min(naturalWidth, frameWidth / scale);
  const cropHeight = Math.min(naturalHeight, frameHeight / scale);
  const maxPanX = Math.max(0, naturalWidth - cropWidth);
  const maxPanY = Math.max(0, naturalHeight - cropHeight);
  const cropX = (maxPanX * (1 + Math.max(-1, Math.min(1, offsetX)))) / 2;
  const cropY = (maxPanY * (1 + Math.max(-1, Math.min(1, offsetY)))) / 2;
  return { cropX, cropY, cropWidth, cropHeight };
}

// ---------------------------------------------------------------------
// Builder 2.0: pages, print sizes, preflight, grouping helpers
// ---------------------------------------------------------------------

// A multi-page flier. Page 1 is persisted in the legacy columns
// (canvas_data / canvas_background) so every existing reader (Fill tool,
// Copilot routes, downloads) keeps working; pages 2..n live in the new
// flier_templates.extra_pages jsonb column.
export type FlierPage = {
  id: string;
  name: string;
  background: string;
  elements: FlierElement[];
};

export function pagesFromTemplate(template: {
  canvas_data?: FlierElement[] | null;
  canvas_background?: string | null;
  extra_pages?: FlierPage[] | null;
}): FlierPage[] {
  const first: FlierPage = {
    id: "page-1",
    name: "Page 1",
    background: template.canvas_background ?? "#FFFFFF",
    elements: Array.isArray(template.canvas_data) ? template.canvas_data : [],
  };
  const extra = Array.isArray(template.extra_pages) ? template.extra_pages : [];
  return [first, ...extra.map((p, i) => ({ ...p, id: p.id || `page-${i + 2}`, name: p.name || `Page ${i + 2}`, elements: p.elements ?? [] }))];
}

export function pagesToTemplateColumns(pages: FlierPage[]) {
  const [first, ...rest] = pages;
  return {
    canvas_data: first?.elements ?? [],
    canvas_background: first?.background ?? "#FFFFFF",
    extra_pages: rest,
  };
}

// Print presets in pixels at 300 DPI. Width/height are the TRIM size; the
// exporter adds bleed around it.
export type PrintPreset = { id: string; label: string; widthIn: number; heightIn: number };
export const PRINT_PRESETS: PrintPreset[] = [
  { id: "letter", label: "US Letter 8.5 × 11 in", widthIn: 8.5, heightIn: 11 },
  { id: "half-letter", label: "Half Letter 5.5 × 8.5 in", widthIn: 5.5, heightIn: 8.5 },
  { id: "tabloid", label: "Tabloid 11 × 17 in", widthIn: 11, heightIn: 17 },
  { id: "a4", label: "A4 210 × 297 mm", widthIn: 8.27, heightIn: 11.69 },
  { id: "postcard", label: "Postcard 4 × 6 in", widthIn: 4, heightIn: 6 },
  { id: "match", label: "Match canvas size", widthIn: 0, heightIn: 0 },
];
export const PRINT_DPI = 300;
export const BLEED_IN = 0.125;

export type PreflightIssue = { level: "warn" | "error"; elementId?: string; message: string };

// Deterministic pre-export checks: low-res photos at the target DPI,
// off-brand fonts/colors, text outside the safe margin, empty image
// frames. Pure function so the Export sheet can re-run it on every change.
export function preflight(
  pages: FlierPage[],
  canvasWidth: number,
  canvasHeight: number,
  opts: { targetDpi?: number; printWidthIn?: number; safeMarginPx?: number } = {}
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const safe = opts.safeMarginPx ?? Math.round(Math.min(canvasWidth, canvasHeight) * 0.04);
  // How many source pixels each canvas pixel needs to be at the target print size.
  const printScale = opts.targetDpi && opts.printWidthIn ? (opts.targetDpi * opts.printWidthIn) / canvasWidth : 1;

  pages.forEach((page, pi) => {
    const { offBrandFonts, offBrandColors } = checkBrandConsistency(page.elements, page.background);
    if (offBrandFonts.length) issues.push({ level: "warn", message: `Page ${pi + 1}: off-brand font${offBrandFonts.length > 1 ? "s" : ""} ${offBrandFonts.join(", ")}` });
    if (offBrandColors.length) issues.push({ level: "warn", message: `Page ${pi + 1}: ${offBrandColors.length} off-brand color${offBrandColors.length > 1 ? "s" : ""} (${offBrandColors.slice(0, 3).join(", ")}${offBrandColors.length > 3 ? "…" : ""})` });

    for (const el of page.elements) {
      if (el.type === "image") {
        if (!el.imageUrl) {
          issues.push({ level: "warn", elementId: el.id, message: `Page ${pi + 1}: an image frame is still empty` });
        } else if (el.naturalWidth && el.naturalHeight) {
          const needW = el.width * printScale * Math.max(1, el.cropZoom);
          const effective = el.naturalWidth / needW;
          if (effective < 0.5) {
            issues.push({ level: "error", elementId: el.id, message: `Page ${pi + 1}: "${el.name ?? "photo"}" is ${el.naturalWidth} px wide — will print very soft at ${opts.targetDpi ?? PRINT_DPI} DPI (${Math.round(effective * (opts.targetDpi ?? PRINT_DPI))} effective DPI)` });
          } else if (effective < 0.8) {
            issues.push({ level: "warn", elementId: el.id, message: `Page ${pi + 1}: "${el.name ?? "photo"}" is ${el.naturalWidth} px wide — may print soft at ${opts.targetDpi ?? PRINT_DPI} DPI` });
          }
        }
      }
      if (el.type === "text") {
        if (!el.text.trim()) issues.push({ level: "warn", elementId: el.id, message: `Page ${pi + 1}: a text box is empty` });
        const outside = el.x < safe || el.y < safe || el.x + el.width > canvasWidth - safe || el.y + el.height > canvasHeight - safe;
        if (outside) issues.push({ level: "warn", elementId: el.id, message: `Page ${pi + 1}: "${el.text.slice(0, 24)}" sits inside the trim/safe margin` });
      }
    }
  });
  return issues;
}

export function groupElements(elements: FlierElement[], ids: string[]): FlierElement[] {
  if (ids.length < 2) return elements;
  const groupId = crypto.randomUUID();
  return elements.map((el) => (ids.includes(el.id) ? ({ ...el, groupId } as FlierElement) : el));
}

export function ungroupElements(elements: FlierElement[], ids: string[]): FlierElement[] {
  return elements.map((el) => {
    if (!ids.includes(el.id)) return el;
    const { groupId: _g, ...rest } = el as any;
    return rest as FlierElement;
  });
}

// Everything that should move with `id`: itself plus any group-mates.
export function expandSelection(elements: FlierElement[], ids: string[]): string[] {
  const groups = new Set(elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId as string));
  const out = new Set(ids);
  for (const el of elements) if (el.groupId && groups.has(el.groupId)) out.add(el.id);
  return [...out];
}

export function layerLabel(el: FlierElement): string {
  if (el.name) return el.name;
  if (el.type === "text") return el.text.trim().slice(0, 22) || "Text";
  if (el.type === "image") return el.imageUrl ? "Photo" : "Photo frame";
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

export const DEFAULT_TEXT_EFFECT = { textEffect: "none" as TextEffect, effectColor: "#C99A3D", effectStrength: 40, curveRadius: 300 };
