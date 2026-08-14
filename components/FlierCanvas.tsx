"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text as KonvaText, Image as KonvaImage, Transformer } from "react-konva";
import type Konva from "konva";
import type { FlierElement } from "@/lib/flierElements";

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
    // Placeholder box while no image is set/loaded yet.
    return <Rect x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation} fill="#EAF3EF" stroke="#DDE4DF" dash={[6, 4]} {...konvaProps} />;
  }
  return <KonvaImage image={img} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation} {...konvaProps} />;
}

export default function FlierCanvas({
  width,
  height,
  elements,
  mode,
  selectedId,
  onSelect,
  onChange,
  scale = 1,
}: {
  width: number;
  height: number;
  elements: FlierElement[];
  mode: "builder" | "fill" | "preview";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (elements: FlierElement[]) => void;
  scale?: number;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, any>>({});

  useEffect(() => {
    if (mode !== "builder" || !trRef.current) return;
    const node = selectedId ? shapeRefs.current[selectedId] : null;
    if (node) {
      trRef.current.nodes([node]);
      trRef.current.getLayer()?.batchDraw();
    } else {
      trRef.current.nodes([]);
    }
  }, [selectedId, mode]);

  function updateElement(id: string, patch: Partial<FlierElement>) {
    if (!onChange) return;
    onChange(elements.map((el) => (el.id === id ? ({ ...el, ...patch } as FlierElement) : el)) as FlierElement[]);
  }

  return (
    <Stage
      ref={stageRef}
      width={width * scale}
      height={height * scale}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (mode === "builder" && e.target === e.target.getStage()) onSelect?.(null);
      }}
      style={{ background: "#fff", borderRadius: 8 }}
    >
      <Layer>
        {elements.map((el) => {
          const interactive = mode === "builder" || (mode === "fill" && el.editable);
          const common = {
            key: el.id,
            ref: (node: any) => {
              if (node) shapeRefs.current[el.id] = node;
            },
            draggable: mode === "builder",
            onClick: () => interactive && onSelect?.(el.id),
            onTap: () => interactive && onSelect?.(el.id),
            onDragEnd: (e: any) => updateElement(el.id, { x: e.target.x(), y: e.target.y() }),
            onTransformEnd: (e: any) => {
              const node = e.target;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              updateElement(el.id, {
                x: node.x(),
                y: node.y(),
                width: Math.max(20, node.width() * scaleX),
                height: Math.max(20, node.height() * scaleY),
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
              />
            );
          }
          if (el.type === "image") {
            return <ImageNode el={el} {...common} />;
          }
          return null;
        })}
        {mode === "builder" && (
          <Transformer
            ref={trRef}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
          />
        )}
      </Layer>
    </Stage>
  );
}

export function exportStageToDataUrl(stageEl: HTMLDivElement | null): string | null {
  const canvas = stageEl?.querySelector("canvas");
  return canvas ? canvas.toDataURL("image/png") : null;
}
