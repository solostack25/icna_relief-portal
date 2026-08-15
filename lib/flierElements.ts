// Shared between the Builder (marketing, full editing) and the Fill
// tool (field offices, only editable elements are interactive) - one
// scene-graph format for both, matching how it's persisted in
// flier_templates.canvas_data.

export type FlierTextElement = {
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
};

export type FlierImageElement = {
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

export type FlierRectElement = {
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

export type FlierCircleElement = {
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

export type FlierLineElement = {
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

export type FlierStarElement = {
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

export type FlierPolygonElement = {
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

export type FlierArrowElement = {
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
export type FlierIconElement = {
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
