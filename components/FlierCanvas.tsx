"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Stage,
  Layer,
  Rect,
  Text as KonvaText,
  TextPath,
  Image as KonvaImage,
  Ellipse,
  Line,
  Group,
  Transformer,
  Star,
  RegularPolygon,
  Arrow,
  Path,
} from "react-konva";
import Konva from "konva";
import type { FlierElement, FlierImageElement, FlierTextElement } from "@/lib/flierElements";
import { computeCoverCrop } from "@/lib/flierElements";
import { ICON_LIBRARY } from "@/lib/flierIcons";

const SNAP_TOLERANCE = 6;
const GUIDE_COLOR = "#D946EF";

function useHtmlImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    image.onload = () => setImg(image);
    return () => setImg(null);
  }, [url]);
  return img;
}

function gradientFillProps(el: any, width: number, height: number) {
  if (!el.gradient?.enabled) return { fill: el.fill };
  const { from, to, direction } = el.gradient;
  const points =
    direction === "horizontal"
      ? { start: { x: 0, y: height / 2 }, end: { x: width, y: height / 2 } }
      : direction === "vertical"
        ? { start: { x: width / 2, y: 0 }, end: { x: width / 2, y: height } }
        : { start: { x: 0, y: 0 }, end: { x: width, y: height } };
  return {
    fillLinearGradientStartPoint: points.start,
    fillLinearGradientEndPoint: points.end,
    fillLinearGradientColorStops: [0, from, 1, to],
  };
}

function maskClipFunc(el: FlierImageElement) {
  return (ctx: any) => {
    if (el.maskShape === "circle") {
      ctx.beginPath();
      ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
    } else if (el.maskShape === "rounded") {
      const r = Math.min(el.maskCornerRadius, el.width / 2, el.height / 2);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(el.width, 0, el.width, el.height, r);
      ctx.arcTo(el.width, el.height, 0, el.height, r);
      ctx.arcTo(0, el.height, 0, 0, r);
      ctx.arcTo(0, 0, el.width, 0, r);
      ctx.closePath();
    } else {
      ctx.rect(0, 0, el.width, el.height);
    }
  };
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
}

function makeDuotoneFilter(shadowHex: string, highlightHex: string) {
  const shadow = hexToRgb(shadowHex);
  const highlight = hexToRgb(highlightHex);
  return function (imageData: ImageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      data[i] = shadow.r + (highlight.r - shadow.r) * gray;
      data[i + 1] = shadow.g + (highlight.g - shadow.g) * gray;
      data[i + 2] = shadow.b + (highlight.b - shadow.b) * gray;
    }
  };
}

// Warmth: shifts red up / blue down (or the reverse) - a cheap white
// balance slider, the kind every phone photo app has.
function makeWarmthFilter(warmth: number) {
  const amt = Math.max(-50, Math.min(50, warmth)) * 1.2;
  return function (imageData: ImageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.max(0, Math.min(255, d[i] + amt));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] - amt));
    }
  };
}

function FilteredImage({ el, img, ...konvaProps }: { el: FlierImageElement; img: HTMLImageElement; [key: string]: any }) {
  const imgRef = useRef<Konva.Image>(null);

  useEffect(() => {
    const node = imgRef.current;
    if (!node) return;
    const filters: any[] = [];
    if (el.filter === "grayscale") filters.push(Konva.Filters.Grayscale);
    if (el.filter === "sepia") filters.push(Konva.Filters.Sepia);
    if (el.filter === "invert") filters.push(Konva.Filters.Invert);
    if (el.filter === "posterize") filters.push(Konva.Filters.Posterize);
    if (el.filter === "duotone") filters.push(makeDuotoneFilter(el.duotoneShadow, el.duotoneHighlight));
    if (el.brightness !== 0) filters.push(Konva.Filters.Brighten);
    if (el.contrast !== 0) filters.push(Konva.Filters.Contrast);
    if (el.blur > 0) filters.push(Konva.Filters.Blur);
    if (el.saturation !== 0 || el.hue !== 0) filters.push(Konva.Filters.HSL);
    if (el.warmth) filters.push(makeWarmthFilter(el.warmth));

    if (filters.length > 0) {
      node.cache();
      node.filters(filters);
      node.brightness(el.brightness);
      node.contrast(el.contrast);
      node.blurRadius(el.blur);
      node.saturation(el.saturation);
      node.hue(el.hue);
    } else {
      node.clearCache();
      node.filters([]);
    }
    node.getLayer()?.batchDraw();
  }, [el.filter, el.brightness, el.contrast, el.blur, el.saturation, el.hue, el.duotoneShadow, el.duotoneHighlight, el.warmth, img, el.width, el.height, el.cropZoom, el.cropOffsetX, el.cropOffsetY]);

  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const { cropX, cropY, cropWidth, cropHeight } = computeCoverCrop(naturalW, naturalH, el.width, el.height, el.cropZoom, el.cropOffsetX, el.cropOffsetY);

  return (
    <KonvaImage
      ref={imgRef}
      image={img}
      width={el.width}
      height={el.height}
      crop={{ x: cropX, y: cropY, width: cropWidth, height: cropHeight }}
      scaleX={el.flipX ? -1 : 1}
      scaleY={el.flipY ? -1 : 1}
      offsetX={el.flipX ? el.width : 0}
      offsetY={el.flipY ? el.height : 0}
      {...konvaProps}
    />
  );
}

const TOOLBAR_GAP = 14;
const TOOLBAR_HEIGHT = 44;

type Guide = { orientation: "v" | "h"; pos: number; label?: string; from?: number; to?: number };

export default function FlierCanvas({
  width,
  height,
  background = "#FFFFFF",
  elements,
  mode,
  selectedId,
  selectedIds,
  onSelect,
  onSelectMany,
  onChange,
  onCommit,
  scale = 1,
  renderToolbar,
  showSafeMargins = false,
  snapEnabled = true,
  cropModeId = null,
  onStageReady,
  onImageMeta,
}: {
  width: number;
  height: number;
  background?: string;
  elements: FlierElement[];
  mode: "builder" | "fill" | "preview";
  selectedId?: string | null;
  // Multi-selection (builder). When present it wins over selectedId.
  selectedIds?: string[];
  onSelect?: (id: string | null) => void;
  onSelectMany?: (ids: string[], additive: boolean) => void;
  onChange?: (elements: FlierElement[]) => void;
  onCommit?: (elements: FlierElement[]) => void;
  scale?: number;
  renderToolbar?: (el: FlierElement) => ReactNode;
  showSafeMargins?: boolean;
  snapEnabled?: boolean;
  // Crop mode: the given image's photo can be dragged inside its frame
  // (updates cropOffsetX/Y) and zoomed with the wheel (cropZoom).
  cropModeId?: string | null;
  onStageReady?: (stage: Konva.Stage | null) => void;
  // Reports a photo's natural pixel size once it loads - stored on the
  // element so preflight can flag low-res photos without re-fetching.
  onImageMeta?: (id: string, naturalWidth: number, naturalHeight: number) => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, any>>({});
  const layerRef = useRef<Konva.Layer>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [toolbarBox, setToolbarBox] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null);
  const dragStart = useRef<{ id: string; x: number; y: number; others: Record<string, { x: number; y: number }> } | null>(null);

  const activeIds = useMemo(() => (selectedIds && selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : []), [selectedIds, selectedId]);
  const primaryId = activeIds[0] ?? null;

  useEffect(() => {
    onStageReady?.(stageRef.current);
    return () => onStageReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const families = Array.from(new Set(elements.filter((el): el is FlierTextElement => el.type === "text").map((el) => el.fontFamily)));
    if (families.length === 0 || typeof document === "undefined" || !("fonts" in document)) return;
    Promise.all(families.map((f) => document.fonts.load(`16px "${f}"`).catch(() => null))).then(() => {
      layerRef.current?.batchDraw();
    });
  }, [elements]);

  const recomputeToolbarBox = () => {
    if (mode !== "builder" || !primaryId) {
      setToolbarBox(null);
      return;
    }
    const nodes = activeIds.map((id) => shapeRefs.current[id]).filter(Boolean);
    if (nodes.length === 0) {
      setToolbarBox(null);
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      const r = n.getClientRect({ relativeTo: stageRef.current });
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
    const top = minY * scale;
    const flip = top - TOOLBAR_GAP - TOOLBAR_HEIGHT < 0;
    setToolbarBox({
      left: minX * scale + ((maxX - minX) * scale) / 2,
      top: flip ? maxY * scale + TOOLBAR_GAP : top - TOOLBAR_GAP,
      width: (maxX - minX) * scale,
      flip,
    });
  };

  useEffect(() => {
    if (mode !== "builder" || !trRef.current) return;
    const nodes = activeIds.map((id) => shapeRefs.current[id]).filter(Boolean);
    trRef.current.nodes(cropModeId ? [] : nodes);
    trRef.current.getLayer()?.batchDraw();
    recomputeToolbarBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, mode, elements.length, scale, cropModeId]);

  useEffect(() => {
    if (mode !== "builder" || activeIds.length === 0) return;
    const nodes = activeIds.map((id) => shapeRefs.current[id]).filter(Boolean);
    const handler = () => recomputeToolbarBox();
    for (const n of nodes) n.on("dragmove.toolbar transform.toolbar dragend.toolbar transformend.toolbar", handler);
    return () => {
      for (const n of nodes) n.off(".toolbar");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, mode]);

  function updateElement(id: string, patch: Partial<FlierElement>, commit = true) {
    const next = elements.map((el) => (el.id === id ? ({ ...el, ...patch } as FlierElement) : el)) as FlierElement[];
    onChange?.(next);
    if (commit) onCommit?.(next);
  }
  function updateMany(patches: Record<string, Partial<FlierElement>>, commit = true) {
    const next = elements.map((el) => (patches[el.id] ? ({ ...el, ...patches[el.id] } as FlierElement) : el)) as FlierElement[];
    onChange?.(next);
    if (commit) onCommit?.(next);
  }

  // ---- Smart snapping: canvas edges/center + every other element's edges
  // and centers (Canva/Figma style). Returns the snapped position and the
  // guide lines to draw, including a distance readout for the nearest
  // horizontal/vertical neighbor.
  function computeSnap(el: FlierElement, node: any) {
    const w = el.width * (node.scaleX() ?? 1);
    const h = el.height * (node.scaleY() ?? 1);
    let x = node.x();
    let y = node.y();
    const myV = [x, x + w / 2, x + w]; // left, center, right
    const myH = [y, y + h / 2, y + h]; // top, middle, bottom

    const targetsV: { pos: number; label?: string }[] = [
      { pos: 0, label: "edge" },
      { pos: width / 2, label: "center" },
      { pos: width, label: "edge" },
    ];
    const targetsH: { pos: number; label?: string }[] = [
      { pos: 0, label: "edge" },
      { pos: height / 2, label: "middle" },
      { pos: height, label: "edge" },
    ];
    for (const other of elements) {
      if (activeIds.includes(other.id) || other.id === el.id) continue;
      targetsV.push({ pos: other.x }, { pos: other.x + other.width / 2 }, { pos: other.x + other.width });
      targetsH.push({ pos: other.y }, { pos: other.y + other.height / 2 }, { pos: other.y + other.height });
    }

    const out: Guide[] = [];
    let bestV: { diff: number; target: number; mine: number; label?: string } | null = null;
    for (const t of targetsV) for (const m of myV) {
      const diff = t.pos - m;
      if (Math.abs(diff) < SNAP_TOLERANCE && (!bestV || Math.abs(diff) < Math.abs(bestV.diff))) bestV = { diff, target: t.pos, mine: m, label: t.label };
    }
    let bestH: { diff: number; target: number; mine: number; label?: string } | null = null;
    for (const t of targetsH) for (const m of myH) {
      const diff = t.pos - m;
      if (Math.abs(diff) < SNAP_TOLERANCE && (!bestH || Math.abs(diff) < Math.abs(bestH.diff))) bestH = { diff, target: t.pos, mine: m, label: t.label };
    }
    if (bestV) {
      x += bestV.diff;
      out.push({ orientation: "v", pos: bestV.target, label: bestV.label });
    }
    if (bestH) {
      y += bestH.diff;
      out.push({ orientation: "h", pos: bestH.target, label: bestH.label });
    }

    // Gap readout to the nearest neighbor on each axis (only when not
    // overlapping on that axis) - the "32 px gap" chip.
    let nearestGapX: { gap: number; from: number; to: number; y: number } | null = null;
    let nearestGapY: { gap: number; from: number; to: number; x: number } | null = null;
    for (const other of elements) {
      if (activeIds.includes(other.id) || other.id === el.id) continue;
      const overlapY = y < other.y + other.height && y + h > other.y;
      const overlapX = x < other.x + other.width && x + w > other.x;
      if (overlapY) {
        const gapR = other.x - (x + w);
        const gapL = x - (other.x + other.width);
        if (gapR >= 0 && (!nearestGapX || gapR < nearestGapX.gap)) nearestGapX = { gap: gapR, from: x + w, to: other.x, y: y + h / 2 };
        if (gapL >= 0 && (!nearestGapX || gapL < nearestGapX.gap)) nearestGapX = { gap: gapL, from: other.x + other.width, to: x, y: y + h / 2 };
      }
      if (overlapX) {
        const gapB = other.y - (y + h);
        const gapT = y - (other.y + other.height);
        if (gapB >= 0 && (!nearestGapY || gapB < nearestGapY.gap)) nearestGapY = { gap: gapB, from: y + h, to: other.y, x: x + w / 2 };
        if (gapT >= 0 && (!nearestGapY || gapT < nearestGapY.gap)) nearestGapY = { gap: gapT, from: other.y + other.height, to: y, x: x + w / 2 };
      }
    }
    if (nearestGapX && nearestGapX.gap < 400) out.push({ orientation: "h", pos: nearestGapX.y, from: nearestGapX.from, to: nearestGapX.to, label: `${Math.round(nearestGapX.gap)} px` });
    if (nearestGapY && nearestGapY.gap < 400) out.push({ orientation: "v", pos: nearestGapY.x, from: nearestGapY.from, to: nearestGapY.to, label: `${Math.round(nearestGapY.gap)} px` });

    return { x, y, guides: out };
  }

  function handleDragStart(el: FlierElement, e: any) {
    const others: Record<string, { x: number; y: number }> = {};
    for (const id of activeIds) {
      if (id === el.id) continue;
      const n = shapeRefs.current[id];
      if (n) others[id] = { x: n.x(), y: n.y() };
    }
    dragStart.current = { id: el.id, x: e.target.x(), y: e.target.y(), others };
  }

  function handleDragMove(el: FlierElement, e: any) {
    const node = e.target;
    if (snapEnabled) {
      const { x, y, guides: g } = computeSnap(el, node);
      node.x(x);
      node.y(y);
      setGuides(g);
    }
    // Move the rest of a multi-selection / group by the same delta.
    const ds = dragStart.current;
    if (ds && ds.id === el.id) {
      const dx = node.x() - ds.x;
      const dy = node.y() - ds.y;
      for (const [id, start] of Object.entries(ds.others)) {
        const n = shapeRefs.current[id];
        if (n) {
          n.x(start.x + dx);
          n.y(start.y + dy);
        }
      }
    }
  }

  function handleDragEnd(el: FlierElement, e: any) {
    setGuides([]);
    const node = e.target;
    const ds = dragStart.current;
    const patches: Record<string, Partial<FlierElement>> = { [el.id]: { x: node.x(), y: node.y() } };
    if (ds && ds.id === el.id) {
      const dx = node.x() - ds.x;
      const dy = node.y() - ds.y;
      for (const [id, start] of Object.entries(ds.others)) patches[id] = { x: start.x + dx, y: start.y + dy };
    }
    dragStart.current = null;
    updateMany(patches);
  }

  // ---- Crop mode: drag the photo inside its frame / wheel to zoom.
  const cropDrag = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(null);
  function cropPointer(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!p) return null;
    return { x: p.x / scale, y: p.y / scale };
  }

  function startEditingText(el: any) {
    setEditingId(el.id);
    setEditingValue(el.text);
  }
  function commitTextEdit() {
    if (editingId) updateElement(editingId, { text: editingValue } as any);
    setEditingId(null);
  }

  const editingEl = editingId ? (elements.find((e) => e.id === editingId) as any) : null;
  const safe = Math.round(Math.min(width, height) * 0.04);

  function textEffectProps(el: FlierTextElement) {
    const strength = Math.max(0, Math.min(100, el.effectStrength ?? 40));
    const color = el.effectColor ?? "#C99A3D";
    switch (el.textEffect) {
      case "shadow":
        return { shadowColor: color, shadowBlur: strength / 10, shadowOffset: { x: strength / 10, y: strength / 10 }, shadowOpacity: 0.9 };
      case "glow":
        return { shadowColor: color, shadowBlur: 4 + strength / 2, shadowOffset: { x: 0, y: 0 }, shadowOpacity: 1 };
      case "outline":
        return { stroke: color, strokeWidth: Math.max(0.5, (strength / 100) * (el.fontSize / 8)), fillAfterStrokeEnabled: true };
      default:
        return {};
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <Stage
        ref={stageRef}
        width={width * scale}
        height={height * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          if (mode === "builder" && e.target === e.target.getStage() && !cropModeId) {
            onSelect?.(null);
            onSelectMany?.([], false);
          }
        }}
        onWheel={(e) => {
          if (!cropModeId) return;
          const el = elements.find((x) => x.id === cropModeId) as FlierImageElement | undefined;
          if (!el) return;
          e.evt.preventDefault();
          const next = Math.max(1, Math.min(4, el.cropZoom - e.evt.deltaY * 0.002));
          updateElement(el.id, { cropZoom: Number(next.toFixed(3)) } as any, false);
        }}
        style={{ background, borderRadius: 4 }}
      >
        <Layer ref={layerRef}>
          <Rect x={0} y={0} width={width} height={height} fill={background} listening={false} />
          {elements.map((el) => {
            if (el.id === editingId) return null;
            const inCrop = cropModeId === el.id;
            const locked = !!el.locked && mode === "builder";
            const interactive = !locked && !cropModeId && (mode === "builder" || (mode === "fill" && el.editable));
            const shadowProps = (el as any).shadow
              ? { shadowColor: "#000000", shadowBlur: 12, shadowOffset: { x: 0, y: 4 }, shadowOpacity: 0.25 }
              : {};
            const borderProps =
              (el as any).borderWidth > 0
                ? { stroke: (el as any).borderColor, strokeWidth: (el as any).borderWidth }
                : {};
            const common = {
              key: el.id,
              ref: (node: any) => {
                if (node) {
                  shapeRefs.current[el.id] = node;
                  if (activeIds.includes(el.id) && trRef.current && !cropModeId) {
                    const nodes = activeIds.map((id) => shapeRefs.current[id]).filter(Boolean);
                    trRef.current.nodes(nodes);
                    trRef.current.getLayer()?.batchDraw();
                  }
                }
              },
              draggable: mode === "builder" && !locked && !cropModeId,
              listening: !cropModeId || inCrop,
              opacity: (el as any).opacity ?? 1,
              onClick: (e: any) => {
                if (!interactive) return;
                const additive = !!(e.evt?.shiftKey || e.evt?.metaKey || e.evt?.ctrlKey);
                if (onSelectMany) onSelectMany([el.id], additive);
                else onSelect?.(el.id);
              },
              onTap: () => interactive && (onSelectMany ? onSelectMany([el.id], false) : onSelect?.(el.id)),
              onDblClick: () => mode === "builder" && el.type === "text" && !locked && startEditingText(el),
              onDblTap: () => mode === "builder" && el.type === "text" && !locked && startEditingText(el),
              onDragStart: (e: any) => mode === "builder" && handleDragStart(el, e),
              onDragMove: (e: any) => mode === "builder" && handleDragMove(el, e),
              onDragEnd: (e: any) => mode === "builder" && handleDragEnd(el, e),
              onTransformEnd: (e: any) => {
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                updateElement(el.id, {
                  x: node.x(),
                  y: node.y(),
                  width: Math.max(10, node.width() * scaleX),
                  height: Math.max(10, node.height() * scaleY),
                  rotation: node.rotation(),
                });
              },
            };

            if (el.type === "rect") {
              return (
                <Rect
                  {...common}
                  {...shadowProps}
                  {...borderProps}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  rotation={el.rotation}
                  {...gradientFillProps(el, el.width, el.height)}
                  cornerRadius={el.cornerRadius}
                />
              );
            }
            if (el.type === "circle") {
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <Ellipse {...shadowProps} {...borderProps} x={el.width / 2} y={el.height / 2} radiusX={el.width / 2} radiusY={el.height / 2} {...gradientFillProps(el, el.width, el.height)} />
                </Group>
              );
            }
            if (el.type === "line") {
              return <Line {...common} x={el.x} y={el.y} points={[0, 0, el.width, 0]} rotation={el.rotation} stroke={el.stroke} strokeWidth={el.strokeWidth} hitStrokeWidth={Math.max(12, el.strokeWidth)} />;
            }
            if (el.type === "star") {
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <Star {...shadowProps} x={el.width / 2} y={el.height / 2} numPoints={el.numPoints} innerRadius={Math.min(el.width, el.height) / 4} outerRadius={Math.min(el.width, el.height) / 2} fill={el.fill} />
                </Group>
              );
            }
            if (el.type === "polygon") {
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <RegularPolygon {...shadowProps} x={el.width / 2} y={el.height / 2} sides={el.sides} radius={Math.min(el.width, el.height) / 2} fill={el.fill} />
                </Group>
              );
            }
            if (el.type === "arrow") {
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <Arrow {...shadowProps} x={0} y={el.height / 2} points={[0, 0, el.width, 0]} pointerLength={el.height} pointerWidth={el.height} fill={el.fill} stroke={el.fill} strokeWidth={el.height / 2.5} />
                </Group>
              );
            }
            if (el.type === "icon") {
              const def = ICON_LIBRARY.find((i) => i.id === el.iconId);
              if (!def) return null;
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <Path {...shadowProps} x={0} y={0} data={def.path} scaleX={el.width / 24} scaleY={el.height / 24} fill={def.mode === "filled" ? el.fill : undefined} stroke={def.mode === "stroke" ? el.fill : undefined} strokeWidth={def.mode === "stroke" ? 2 : 0} lineCap="round" lineJoin="round" />
                </Group>
              );
            }
            if (el.type === "text") {
              const fx = textEffectProps(el);
              if (el.textEffect === "curve") {
                // Arc path across the element's width; radius controls
                // how much it bends (bigger = flatter).
                const r = Math.max(60, el.curveRadius ?? 300);
                const w = el.width;
                const half = Math.min(w / 2, r);
                const sag = r - Math.sqrt(Math.max(0, r * r - half * half));
                const data = `M 0 ${sag + el.fontSize} A ${r} ${r} 0 0 1 ${w} ${sag + el.fontSize}`;
                return (
                  <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                    <Rect x={0} y={0} width={el.width} height={el.height} fill="transparent" />
                    <TextPath {...fx} data={data} text={el.text} fontFamily={el.fontFamily} fontSize={el.fontSize} fontStyle={el.fontStyle} fill={el.fill} letterSpacing={el.letterSpacing} align={el.align} listening={false} />
                  </Group>
                );
              }
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  {el.textEffect === "background" && (
                    <Rect x={-8} y={-4} width={el.width + 16} height={el.height + 8} fill={el.effectColor ?? "#C99A3D"} cornerRadius={Math.max(2, (el.effectStrength ?? 40) / 6)} listening={false} />
                  )}
                  <KonvaText
                    {...fx}
                    x={0}
                    y={0}
                    width={el.width}
                    height={el.height}
                    text={el.text}
                    fontFamily={el.fontFamily}
                    fontSize={el.fontSize}
                    fontStyle={el.fontStyle}
                    align={el.align}
                    fill={el.fill}
                    letterSpacing={el.letterSpacing}
                    lineHeight={el.lineHeight}
                  />
                </Group>
              );
            }
            if (el.type === "image") {
              return (
                <ImageWithMask
                  key={el.id}
                  el={el}
                  common={common}
                  shadowProps={shadowProps}
                  borderProps={borderProps}
                  cropMode={inCrop}
                  onImageMeta={onImageMeta}
                  onCropDragStart={() => {
                    const p = cropPointer();
                    if (p) cropDrag.current = { startX: p.x, startY: p.y, offX: el.cropOffsetX, offY: el.cropOffsetY };
                  }}
                  onCropDragMove={() => {
                    const d = cropDrag.current;
                    const p = cropPointer();
                    if (!d || !p) return;
                    // Dragging right reveals more of the LEFT of the source
                    // image, i.e. offset decreases - hence the sign flip.
                    const nx = Math.max(-1, Math.min(1, d.offX - ((p.x - d.startX) / el.width) * 2));
                    const ny = Math.max(-1, Math.min(1, d.offY - ((p.y - d.startY) / el.height) * 2));
                    updateElement(el.id, { cropOffsetX: nx, cropOffsetY: ny } as any, false);
                  }}
                  onCropDragEnd={() => {
                    cropDrag.current = null;
                    onCommit?.(elements);
                  }}
                />
              );
            }
            return null;
          })}

          {mode === "builder" && showSafeMargins && (
            <Rect x={safe} y={safe} width={width - 2 * safe} height={height - 2 * safe} stroke="#3E7C9A" strokeWidth={1} dash={[6, 4]} listening={false} opacity={0.7} />
          )}

          {mode === "builder" &&
            guides.map((g, i) =>
              g.orientation === "v" ? (
                <Group key={i} listening={false}>
                  <Line points={[g.pos, g.from ?? 0, g.pos, g.to ?? height]} stroke={GUIDE_COLOR} strokeWidth={1 / scale} dash={g.from !== undefined ? undefined : [4 / scale, 4 / scale]} />
                  {g.label && (
                    <GuideChip x={g.pos + 6 / scale} y={g.from !== undefined ? (g.from + g.to!) / 2 : 8 / scale} text={g.label} scale={scale} />
                  )}
                </Group>
              ) : (
                <Group key={i} listening={false}>
                  <Line points={[g.from ?? 0, g.pos, g.to ?? width, g.pos]} stroke={GUIDE_COLOR} strokeWidth={1 / scale} dash={g.from !== undefined ? undefined : [4 / scale, 4 / scale]} />
                  {g.label && (
                    <GuideChip x={g.from !== undefined ? (g.from + g.to!) / 2 : 8 / scale} y={g.pos + 6 / scale} text={g.label} scale={scale} />
                  )}
                </Group>
              )
            )}

          {mode === "builder" && (
            <Transformer
              ref={trRef}
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10 ? oldBox : newBox)}
              anchorSize={9}
              anchorCornerRadius={5}
              anchorStroke="#1F6F54"
              anchorFill="#FFFFFF"
              anchorStrokeWidth={1.5}
              borderStroke="#1F6F54"
              borderStrokeWidth={1.5}
              borderDash={[4, 3]}
              rotateAnchorOffset={22}
              shouldOverdrawWholeArea={activeIds.length > 1}
            />
          )}
        </Layer>
      </Stage>

      {mode === "builder" && toolbarBox && primaryId && renderToolbar && !editingId && !cropModeId && (
        <div
          className="hidden lg:block"
          style={{
            position: "absolute",
            left: toolbarBox.left,
            top: toolbarBox.top,
            transform: `translate(-50%, ${toolbarBox.flip ? "0" : "-100%"})`,
            zIndex: 20,
            pointerEvents: "auto",
          }}
        >
          {renderToolbar(elements.find((e) => e.id === primaryId)!)}
        </div>
      )}

      {editingEl && (
        <textarea
          autoFocus
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={commitTextEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditingId(null);
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitTextEdit();
            }
          }}
          style={{
            position: "absolute",
            left: editingEl.x * scale,
            top: editingEl.y * scale,
            width: editingEl.width * scale,
            height: editingEl.height * scale,
            fontFamily: editingEl.fontFamily,
            fontSize: editingEl.fontSize * scale,
            fontWeight: editingEl.fontStyle.includes("bold") ? 700 : 400,
            fontStyle: editingEl.fontStyle.includes("italic") ? "italic" : "normal",
            color: editingEl.fill,
            textAlign: editingEl.align,
            lineHeight: editingEl.lineHeight,
            letterSpacing: editingEl.letterSpacing,
            border: "1.5px solid var(--portal-emerald)",
            outline: "none",
            resize: "none",
            padding: 0,
            background: "rgba(255,255,255,0.9)",
          }}
        />
      )}
    </div>
  );
}

function GuideChip({ x, y, text, scale }: { x: number; y: number; text: string; scale: number }) {
  const fs = 11 / scale;
  const w = (text.length * 6.5 + 10) / scale;
  const h = 16 / scale;
  return (
    <Group x={x} y={y} listening={false}>
      <Rect width={w} height={h} fill="#FFFFFF" stroke="#F5D0FE" strokeWidth={1 / scale} cornerRadius={3 / scale} />
      <KonvaText text={text} x={5 / scale} y={2.5 / scale} fontSize={fs} fontFamily="Manrope, system-ui, sans-serif" fontStyle="bold" fill={GUIDE_COLOR} />
    </Group>
  );
}

function ImageWithMask({
  el,
  common,
  shadowProps,
  borderProps,
  cropMode,
  onImageMeta,
  onCropDragStart,
  onCropDragMove,
  onCropDragEnd,
}: {
  el: FlierImageElement;
  common: any;
  shadowProps: any;
  borderProps: any;
  cropMode: boolean;
  onImageMeta?: (id: string, w: number, h: number) => void;
  onCropDragStart: () => void;
  onCropDragMove: () => void;
  onCropDragEnd: () => void;
}) {
  const img = useHtmlImage(el.imageUrl);
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!img || !onImageMeta || !el.imageUrl) return;
    if (reported.current === el.imageUrl) return;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (el.naturalWidth !== nw || el.naturalHeight !== nh) onImageMeta(el.id, nw, nh);
    reported.current = el.imageUrl;
  }, [img, el.id, el.imageUrl, el.naturalWidth, el.naturalHeight, onImageMeta]);

  if (!img) {
    return (
      <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
        <Rect x={0} y={0} width={el.width} height={el.height} fill="#EAF3EF" stroke="#8FC2A6" strokeWidth={1.5} dash={[7, 5]} cornerRadius={Math.min(16, el.width * 0.05)} />
        <Path data="M -18 -12 L 18 -12 L 18 12 L -18 12 Z M -13 8 L -5 -2 L 2 5 L 8 -3 L 13 8 Z" x={el.width / 2} y={el.height / 2 - 16} stroke="#4F8A6B" strokeWidth={2} lineJoin="round" listening={false} />
        <Ellipse x={el.width / 2 - 7} y={el.height / 2 - 20} radiusX={2.5} radiusY={2.5} fill="#4F8A6B" listening={false} />
        {el.width > 70 && el.height > 60 && (
          <KonvaText text="Click Choose Image →" x={0} y={el.height / 2 + 8} width={el.width} align="center" fontSize={Math.max(11, Math.min(14, el.width * 0.07))} fontFamily="Inter, sans-serif" fontStyle="600" fill="#4F8A6B" listening={false} />
        )}
      </Group>
    );
  }

  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  // Ghost of the full source image behind the frame while cropping, so
  // the user can see what's outside the mask as they drag.
  const ghost = (() => {
    if (!cropMode) return null;
    const { cropX, cropY, cropWidth } = computeCoverCrop(naturalW, naturalH, el.width, el.height, el.cropZoom, el.cropOffsetX, el.cropOffsetY);
    const s = el.width / cropWidth; // source px -> frame px
    return { x: -cropX * s, y: -cropY * s, w: naturalW * s, h: naturalH * s };
  })();

  const blend = el.blendMode && el.blendMode !== "normal" ? { globalCompositeOperation: el.blendMode as any } : {};

  return (
    <>
      {ghost && (
        <Group x={el.x} y={el.y} rotation={el.rotation} listening={false}>
          <KonvaImage image={img} x={ghost.x} y={ghost.y} width={ghost.w} height={ghost.h} opacity={0.35} />
          <Rect x={ghost.x} y={ghost.y} width={ghost.w} height={ghost.h} stroke="#FFFFFF" strokeWidth={1.5} dash={[6, 4]} />
        </Group>
      )}
      <Group
        {...common}
        {...blend}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        clipFunc={el.maskShape !== "rect" ? maskClipFunc(el) : undefined}
        draggable={common.draggable && !cropMode}
        onMouseDown={cropMode ? onCropDragStart : undefined}
        onTouchStart={cropMode ? onCropDragStart : undefined}
        onMouseMove={cropMode ? (e: any) => e.evt.buttons === 1 && onCropDragMove() : undefined}
        onTouchMove={cropMode ? onCropDragMove : undefined}
        onMouseUp={cropMode ? onCropDragEnd : undefined}
        onTouchEnd={cropMode ? onCropDragEnd : undefined}
      >
        <Rect x={0} y={0} width={el.width} height={el.height} fill="transparent" />
        <FilteredImage el={el} img={img} x={0} y={0} listening={false} />
        {(el.overlayOpacity ?? 0) > 0 && (
          <Rect x={0} y={0} width={el.width} height={el.height} fill={el.overlayColor ?? "#1F6F54"} opacity={el.overlayOpacity} listening={false} />
        )}
        {(el.vignette ?? 0) > 0 && (
          <Rect
            x={0}
            y={0}
            width={el.width}
            height={el.height}
            listening={false}
            fillRadialGradientStartPoint={{ x: el.width / 2, y: el.height / 2 }}
            fillRadialGradientEndPoint={{ x: el.width / 2, y: el.height / 2 }}
            fillRadialGradientStartRadius={Math.min(el.width, el.height) * 0.35}
            fillRadialGradientEndRadius={Math.max(el.width, el.height) * 0.75}
            fillRadialGradientColorStops={[0, "rgba(0,0,0,0)", 1, `rgba(0,0,0,${(el.vignette ?? 0) / 100})`]}
          />
        )}
        {el.maskShape === "circle" && el.borderWidth > 0 && (
          <Ellipse x={el.width / 2} y={el.height / 2} radiusX={el.width / 2} radiusY={el.height / 2} {...borderProps} listening={false} />
        )}
        {el.maskShape !== "circle" && el.borderWidth > 0 && (
          <Rect x={0} y={0} width={el.width} height={el.height} cornerRadius={el.maskShape === "rounded" ? el.maskCornerRadius : 0} {...borderProps} listening={false} />
        )}
        {cropMode && <Rect x={0} y={0} width={el.width} height={el.height} stroke="#1F6F54" strokeWidth={3} listening={false} />}
      </Group>
    </>
  );
}
