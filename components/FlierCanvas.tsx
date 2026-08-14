"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text as KonvaText, Image as KonvaImage, Ellipse, Line, Transformer } from "react-konva";
import type Konva from "konva";
import type { FlierElement } from "@/lib/flierElements";

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

function ImageNode({ el, ...konvaProps }: { el: any; [key: string]: any }) {
  const img = useHtmlImage(el.imageUrl);
  if (!img) {
    return (
      <Rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        opacity={el.opacity}
        fill="#EAF3EF"
        stroke="#DDE4DF"
        dash={[6, 4]}
        {...konvaProps}
      />
    );
  }
  return (
    <KonvaImage
      image={img}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      opacity={el.opacity}
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
              return <ImageNode el={el} {...common} />;
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
