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
  filter: "none" | "grayscale" | "sepia";
  brightness: number; // -1..1
  contrast: number; // -100..100 (Konva's Contrast filter range)
  blur: number; // 0..20
  // Border + shadow, shared styling concept across shapes/images.
  borderWidth: number;
  borderColor: string;
  shadow: boolean;
};

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

export type FlierElement = FlierTextElement | FlierImageElement | FlierRectElement | FlierCircleElement | FlierLineElement;

// Curated brand choices, not a free color/font picker for offices -
// admin-configurable via integration_settings-style pattern would be a
// reasonable follow-up, but starting with the portal's own established
// brand identity (emerald/gold palette, Fraunces/Manrope) so there's a
// real, working default rather than blocking on a separate settings build.
export const BRAND_FONTS = ["Manrope", "Fraunces", "IBM Plex Mono"];
export const BRAND_COLORS = ["#16302B", "#1F6F54", "#C99A3D", "#FBF7EF", "#FFFFFF", "#3E7C9A", "#B55139"];

export const CANVAS_SIZE_PRESETS = [
  { label: "Flier (Print)", width: 1080, height: 1350 },
  { label: "Instagram Post", width: 1080, height: 1080 },
  { label: "Instagram Story", width: 1080, height: 1920 },
  { label: "Facebook Post", width: 1200, height: 630 },
  { label: "US Letter Poster", width: 850, height: 1100 },
];

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
