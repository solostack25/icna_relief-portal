"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text as KonvaText, Image as KonvaImage, Ellipse, Line, Group, Transformer } from "react-konva";
import Konva from "konva";
import type { FlierElement, FlierImageElement } from "@/lib/flierElements";
import { computeCoverCrop } from "@/lib/flierElements";

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

function FilteredImage({ el, img, ...konvaProps }: { el: FlierImageElement; img: HTMLImageElement; [key: string]: any }) {
  const imgRef = useRef<Konva.Image>(null);

  useEffect(() => {
    const node = imgRef.current;
    if (!node) return;
    const filters: any[] = [];
    if (el.filter === "grayscale") filters.push(Konva.Filters.Grayscale);
    if (el.filter === "sepia") filters.push(Konva.Filters.Sepia);
    if (el.brightness !== 0) filters.push(Konva.Filters.Brighten);
    if (el.contrast !== 0) filters.push(Konva.Filters.Contrast);
    if (el.blur > 0) filters.push(Konva.Filters.Blur);

    if (filters.length > 0) {
      node.cache();
      node.filters(filters);
      node.brightness(el.brightness);
      node.contrast(el.contrast);
      node.blurRadius(el.blur);
    } else {
      node.clearCache();
      node.filters([]);
    }
    node.getLayer()?.batchDraw();
  }, [el.filter, el.brightness, el.contrast, el.blur, img]);

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
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, any>>({});
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  useEffect(() => {
    if (mode !== "builder" || !trRef.current) return;
    const node = selectedId ? shapeRefs.current[selectedId] : null;
    if (node) {
      trRef.current.nodes([node]);
      trRef.current.getLayer()?.batchDraw();
    } else {
      trRef.current.nodes([]);
    }
  }, [selectedId, mode, elements.length]);

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
                if (node) shapeRefs.current[el.id] = node;
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
                  fill={el.fill}
                  cornerRadius={el.cornerRadius}
                />
              );
            }
            if (el.type === "circle") {
              return (
                <Ellipse
                  {...common}
                  {...shadowProps}
                  {...borderProps}
                  x={el.x + el.width / 2}
                  y={el.y + el.height / 2}
                  radiusX={el.width / 2}
                  radiusY={el.height / 2}
                  rotation={el.rotation}
                  fill={el.fill}
                />
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
      <Rect
        {...common}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        fill="#EAF3EF"
        stroke="#DDE4DF"
        dash={[6, 4]}
      />
    );
  }

  return (
    <Group {...common} x={el.x} y={el.y} rotation={el.rotation} clipFunc={el.maskShape !== "rect" ? maskClipFunc(el) : undefined}>
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
