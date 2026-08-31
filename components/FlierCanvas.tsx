"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Stage, Layer, Rect, Text as KonvaText, Image as KonvaImage, Ellipse, Line, Group, Transformer, Star, RegularPolygon, Arrow, Path } from "react-konva";
import Konva from "konva";
import type { FlierElement, FlierImageElement } from "@/lib/flierElements";
import { computeCoverCrop } from "@/lib/flierElements";
import { ICON_LIBRARY } from "@/lib/flierIcons";

const SNAP_TOLERANCE = 8;

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

// Konva doesn't ship a duotone filter - custom filters are just a
// function(imageData) that mutates the pixel buffer directly, same
// contract as Konva's own built-ins, so this plugs into the same
// filters() array as Grayscale/Sepia/etc.
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
  }, [el.filter, el.brightness, el.contrast, el.blur, el.saturation, el.hue, el.duotoneShadow, el.duotoneHighlight, img]);

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
      {...konvaProps}
    />
  );
}

// Toolbar floats ~14px above the selection's bounding box, in the same
// scaled screen-pixel space as the inline text-edit overlay below. Clamped
// to stay within the stage horizontally so it doesn't clip off-canvas for
// elements near the left/right edge, and flips below the element if there's
// no room above (element pinned to the top of the canvas).
const TOOLBAR_GAP = 14;
const TOOLBAR_HEIGHT = 44;

export default function FlierCanvas({
  width,
  height,
  background = "#FFFFFF",
  elements,
  mode,
  selectedId,
  onSelect,
  onChange,
  onCommit,
  scale = 1,
  renderToolbar,
}: {
  width: number;
  height: number;
  background?: string;
  elements: FlierElement[];
  mode: "builder" | "fill" | "preview";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (elements: FlierElement[]) => void;
  onCommit?: (elements: FlierElement[]) => void;
  scale?: number;
  // Render-prop so BuilderClient owns the buttons/content (duplicate,
  // delete, align, reorder) while FlierCanvas only owns positioning -
  // it's the one place that actually knows the selected node's on-screen
  // bounding box across drag/transform/scale.
  renderToolbar?: (el: FlierElement) => ReactNode;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, any>>({});
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [toolbarBox, setToolbarBox] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null);

  const recomputeToolbarBox = () => {
    if (mode !== "builder" || !selectedId) {
      setToolbarBox(null);
      return;
    }
    const node = shapeRefs.current[selectedId];
    if (!node) {
      setToolbarBox(null);
      return;
    }
    // getClientRect is already in stage pixels post-transform (rotation,
    // scale from resize handles); multiplying by our own `scale` maps
    // that into the screen space the Stage itself is rendered at.
    const rect = node.getClientRect({ relativeTo: stageRef.current });
    const top = rect.y * scale;
    const flip = top - TOOLBAR_GAP - TOOLBAR_HEIGHT < 0;
    setToolbarBox({
      left: rect.x * scale + (rect.width * scale) / 2,
      top: flip ? (rect.y + rect.height) * scale + TOOLBAR_GAP : top - TOOLBAR_GAP,
      width: rect.width * scale,
      flip,
    });
  };

  useEffect(() => {
    if (mode !== "builder" || !trRef.current) return;
    const node = selectedId ? shapeRefs.current[selectedId] : null;
    if (node) {
      trRef.current.nodes([node]);
      trRef.current.getLayer()?.batchDraw();
    } else {
      trRef.current.nodes([]);
    }
    recomputeToolbarBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mode, elements.length, scale]);

  // Keep the toolbar glued to the node through drag and resize/rotate -
  // Konva's Transformer fires these directly on the node it's attached to.
  useEffect(() => {
    if (mode !== "builder" || !selectedId) return;
    const node = shapeRefs.current[selectedId];
    if (!node) return;
    const handler = () => recomputeToolbarBox();
    node.on("dragmove.toolbar transform.toolbar dragend.toolbar transformend.toolbar", handler);
    return () => node.off(".toolbar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mode]);

  function updateElement(id: string, patch: Partial<FlierElement>, commit = true) {
    const next = elements.map((el) => (el.id === id ? ({ ...el, ...patch } as FlierElement) : el)) as FlierElement[];
    onChange?.(next);
    if (commit) onCommit?.(next);
  }

  function handleDragMove(el: FlierElement, e: any) {
    const node = e.target;
    const cx = node.x() + (el.width * (node.scaleX() ?? 1)) / 2;
    const cy = node.y() + (el.height * (node.scaleY() ?? 1)) / 2;
    let snapX: number | null = null;
    let snapY: number | null = null;

    if (Math.abs(cx - width / 2) < SNAP_TOLERANCE) {
      node.x(width / 2 - el.width / 2);
      snapX = width / 2;
    }
    if (Math.abs(cy - height / 2) < SNAP_TOLERANCE) {
      node.y(height / 2 - el.height / 2);
      snapY = height / 2;
    }
    setGuides({ x: snapX, y: snapY });
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

  return (
    <div style={{ position: "relative" }}>
      <Stage
        ref={stageRef}
        width={width * scale}
        height={height * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          if (mode === "builder" && e.target === e.target.getStage()) onSelect?.(null);
        }}
        style={{ background, borderRadius: 4 }}
      >
        <Layer>
          <Rect x={0} y={0} width={width} height={height} fill={background} listening={false} />
          {elements.map((el) => {
            if (el.id === editingId) return null; // covered by the HTML overlay instead
            const interactive = mode === "builder" || (mode === "fill" && el.editable);
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
                  // Images swap from a <Rect> placeholder to a real <Group> once
                  // they finish loading (see ImageWithMask) - that's a totally
                  // different Konva node, but the Transformer only re-syncs via
                  // the effect below, which doesn't re-run on that swap since
                  // selectedId/mode/elements.length are all unchanged. Without
                  // this, the resize handles stay attached to the now-destroyed
                  // placeholder: they visibly move when dragged, but nothing
                  // about the actual (new) node - and therefore the image -
                  // changes. Re-attaching here the moment the real node mounts
                  // fixes it immediately regardless of load timing.
                  if (el.id === selectedId && trRef.current) {
                    trRef.current.nodes([node]);
                    trRef.current.getLayer()?.batchDraw();
                  }
                }
              },
              draggable: mode === "builder",
              opacity: (el as any).opacity ?? 1,
              onClick: () => interactive && onSelect?.(el.id),
              onTap: () => interactive && onSelect?.(el.id),
              onDblClick: () => mode === "builder" && el.type === "text" && startEditingText(el),
              onDblTap: () => mode === "builder" && el.type === "text" && startEditingText(el),
              onDragMove: (e: any) => mode === "builder" && handleDragMove(el, e),
              onDragEnd: (e: any) => {
                setGuides({ x: null, y: null });
                updateElement(el.id, { x: e.target.x(), y: e.target.y() });
              },
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
                  <Ellipse
                    {...shadowProps}
                    {...borderProps}
                    x={el.width / 2}
                    y={el.height / 2}
                    radiusX={el.width / 2}
                    radiusY={el.height / 2}
                    {...gradientFillProps(el, el.width, el.height)}
                  />
                </Group>
              );
            }
            if (el.type === "line") {
              return (
                <Line
                  {...common}
                  x={el.x}
                  y={el.y}
                  points={[0, 0, el.width, 0]}
                  rotation={el.rotation}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                />
              );
            }
            if (el.type === "star") {
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <Star
                    {...shadowProps}
                    x={el.width / 2}
                    y={el.height / 2}
                    numPoints={el.numPoints}
                    innerRadius={Math.min(el.width, el.height) / 4}
                    outerRadius={Math.min(el.width, el.height) / 2}
                    fill={el.fill}
                  />
                </Group>
              );
            }
            if (el.type === "polygon") {
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <RegularPolygon
                    {...shadowProps}
                    x={el.width / 2}
                    y={el.height / 2}
                    sides={el.sides}
                    radius={Math.min(el.width, el.height) / 2}
                    fill={el.fill}
                  />
                </Group>
              );
            }
            if (el.type === "arrow") {
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <Arrow
                    {...shadowProps}
                    x={0}
                    y={el.height / 2}
                    points={[0, 0, el.width, 0]}
                    pointerLength={el.height}
                    pointerWidth={el.height}
                    fill={el.fill}
                    stroke={el.fill}
                    strokeWidth={el.height / 2.5}
                  />
                </Group>
              );
            }
            if (el.type === "icon") {
              const def = ICON_LIBRARY.find((i) => i.id === el.iconId);
              if (!def) return null;
              return (
                <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
                  <Path
                    {...shadowProps}
                    x={0}
                    y={0}
                    data={def.path}
                    scaleX={el.width / 24}
                    scaleY={el.height / 24}
                    fill={def.mode === "filled" ? el.fill : undefined}
                    stroke={def.mode === "stroke" ? el.fill : undefined}
                    strokeWidth={def.mode === "stroke" ? 2 : 0}
                    lineCap="round"
                    lineJoin="round"
                  />
                </Group>
              );
            }
            if (el.type === "text") {
              return (
                <KonvaText
                  {...common}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  rotation={el.rotation}
                  text={el.text}
                  fontFamily={el.fontFamily}
                  fontSize={el.fontSize}
                  fontStyle={el.fontStyle}
                  align={el.align}
                  fill={el.fill}
                  letterSpacing={el.letterSpacing}
                  lineHeight={el.lineHeight}
                />
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
                />
              );
            }
            return null;
          })}
          {mode === "builder" && guides.x !== null && (
            <Line points={[guides.x, 0, guides.x, height]} stroke="#C99A3D" strokeWidth={1} dash={[4, 4]} listening={false} />
          )}
          {mode === "builder" && guides.y !== null && (
            <Line points={[0, guides.y, width, guides.y]} stroke="#C99A3D" strokeWidth={1} dash={[4, 4]} listening={false} />
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
            />
          )}
        </Layer>
      </Stage>

      {mode === "builder" && toolbarBox && selectedId && renderToolbar && !editingId && (
        <div
          // Floating-over-the-element toolbar only makes sense at desktop
          // zoom levels - on a phone the canvas is scaled down small enough
          // (and covered by the user's own thumb while dragging) that this
          // would be unreliable to tap. Mobile instead gets a full-width bar
          // docked above the bottom tool rail - see BuilderClient.
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
          {renderToolbar(elements.find((e) => e.id === selectedId)!)}
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

// Image elements are wrapped in a Group so the mask (clipFunc) applies
// to the group's local coordinate space - the draggable/transformable
// node is the Group itself (carries `common`'s handlers), with the
// actual filtered/cropped Image positioned at local (0,0) inside it.
function ImageWithMask({
  el,
  common,
  shadowProps,
  borderProps,
}: {
  el: FlierImageElement;
  common: any;
  shadowProps: any;
  borderProps: any;
}) {
  const img = useHtmlImage(el.imageUrl);

  if (!img) {
    return (
      <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}>
        <Rect x={0} y={0} width={el.width} height={el.height} fill="#EAF3EF" stroke="#8FC2A6" strokeWidth={1.5} dash={[7, 5]} cornerRadius={Math.min(16, el.width * 0.05)} />
        {/* A plain dashed box gives no clue what to do next - this is a
            picture-frame glyph + label, centered, drawn only while empty.
            Purely decorative (listening: false) so clicks still hit the
            Rect above and select the element normally. */}
        <Path
          data="M -18 -12 L 18 -12 L 18 12 L -18 12 Z M -13 8 L -5 -2 L 2 5 L 8 -3 L 13 8 Z"
          x={el.width / 2}
          y={el.height / 2 - 16}
          stroke="#4F8A6B"
          strokeWidth={2}
          lineJoin="round"
          listening={false}
        />
        <Ellipse x={el.width / 2 - 7} y={el.height / 2 - 20} radiusX={2.5} radiusY={2.5} fill="#4F8A6B" listening={false} />
        {el.width > 70 && el.height > 60 && (
          <KonvaText
            text="Click Choose Image →"
            x={0}
            y={el.height / 2 + 8}
            width={el.width}
            align="center"
            fontSize={Math.max(11, Math.min(14, el.width * 0.07))}
            fontFamily="Inter, sans-serif"
            fontStyle="600"
            fill="#4F8A6B"
            listening={false}
          />
        )}
      </Group>
    );
  }

  return (
    <Group {...common} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation} clipFunc={el.maskShape !== "rect" ? maskClipFunc(el) : undefined}>
      {/* Every visible child below is listening={false} (avoids per-pixel
          hit quirks on a cached/filtered image), which meant the Group had
          no hit region at all once an image loaded - it couldn't be clicked
          or dragged, only the pre-load placeholder Rect could. This invisible
          rect restores a normal full-frame hit target; clipFunc above still
          confines it to the masked shape (e.g. circle) same as the visuals. */}
      <Rect x={0} y={0} width={el.width} height={el.height} fill="transparent" />
      <FilteredImage el={el} img={img} x={0} y={0} listening={false} />
      {el.maskShape === "circle" && el.borderWidth > 0 && (
        <Ellipse
          x={el.width / 2}
          y={el.height / 2}
          radiusX={el.width / 2}
          radiusY={el.height / 2}
          {...borderProps}
          listening={false}
        />
      )}
      {el.maskShape !== "circle" && el.borderWidth > 0 && (
        <Rect
          x={0}
          y={0}
          width={el.width}
          height={el.height}
          cornerRadius={el.maskShape === "rounded" ? el.maskCornerRadius : 0}
          {...borderProps}
          listening={false}
        />
      )}
    </Group>
  );
}
