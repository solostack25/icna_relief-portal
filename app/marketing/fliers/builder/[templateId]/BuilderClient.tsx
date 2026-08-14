"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  type FlierElement,
  BRAND_FONTS,
  BRAND_COLORS,
  CANVAS_SIZE_PRESETS,
  newTextElement,
  newImageElement,
  newRectElement,
  newCircleElement,
  newLineElement,
} from "@/lib/flierElements";
import ApprovedImagePicker from "../../ApprovedImagePicker";
import { Icon } from "../../icons";

const FlierCanvas = dynamic(() => import("@/components/FlierCanvas"), { ssr: false });

const ICONS = {
  text: <Icon.TextTool />,
  image: <Icon.ImageTool />,
  rect: <Icon.RectTool />,
  circle: <Icon.CircleTool />,
  line: <Icon.LineTool />,
};

export default function BuilderClient({ template }: { template: any }) {
  const supabase = createClient();

  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category ?? "");
  const [canvasWidth, setCanvasWidth] = useState(template.canvas_width);
  const [canvasHeight, setCanvasHeight] = useState(template.canvas_height);
  const [background, setBackground] = useState(template.canvas_background ?? "#FFFFFF");
  const [elements, setElements] = useState<FlierElement[]>(template.canvas_data ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [zoom, setZoom] = useState(0.42);

  // ---- Undo/redo history ----
  const [history, setHistory] = useState<FlierElement[][]>([elements]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const commit = useCallback(
    (next: FlierElement[]) => {
      setElements(next);
      setHistory((h) => [...h.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
    },
    [historyIndex]
  );

  function undo() {
    if (historyIndex === 0) return;
    setHistoryIndex((i) => i - 1);
    setElements(history[historyIndex - 1]);
  }
  function redo() {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex((i) => i + 1);
    setElements(history[historyIndex + 1]);
  }

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  function addElement(el: FlierElement) {
    commit([...elements, el]);
    setSelectedId(el.id);
  }
  function updateSelected(patch: Partial<FlierElement>, shouldCommit = true) {
    if (!selected) return;
    const next = elements.map((e) => (e.id === selected.id ? ({ ...e, ...patch } as FlierElement) : e));
    if (shouldCommit) commit(next);
    else setElements(next);
  }
  function deleteSelected() {
    if (!selected) return;
    commit(elements.filter((e) => e.id !== selected.id));
    setSelectedId(null);
  }
  function duplicateSelected() {
    if (!selected) return;
    const copy = { ...selected, id: crypto.randomUUID(), x: selected.x + 20, y: selected.y + 20 };
    commit([...elements, copy as FlierElement]);
    setSelectedId(copy.id);
  }

  // ---- Layer ordering ----
  function reorder(dir: "front" | "back" | "forward" | "backward") {
    if (!selected) return;
    const idx = elements.findIndex((e) => e.id === selected.id);
    const rest = elements.filter((e) => e.id !== selected.id);
    let next: FlierElement[];
    if (dir === "front") next = [...rest, selected];
    else if (dir === "back") next = [selected, ...rest];
    else if (dir === "forward") {
      const newIdx = Math.min(idx + 1, elements.length - 1);
      next = [...elements];
      next.splice(idx, 1);
      next.splice(newIdx, 0, selected);
    } else {
      const newIdx = Math.max(idx - 1, 0);
      next = [...elements];
      next.splice(idx, 1);
      next.splice(newIdx, 0, selected);
    }
    commit(next);
  }

  // ---- Alignment ----
  function align(pos: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
    if (!selected) return;
    const patch: Partial<FlierElement> = {};
    if (pos === "left") patch.x = 0;
    if (pos === "hcenter") patch.x = (canvasWidth - selected.width) / 2;
    if (pos === "right") patch.x = canvasWidth - selected.width;
    if (pos === "top") patch.y = 0;
    if (pos === "vcenter") patch.y = (canvasHeight - selected.height) / 2;
    if (pos === "bottom") patch.y = canvasHeight - selected.height;
    updateSelected(patch);
  }

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateSelected({ x: (selected?.x ?? 0) + dx, y: (selected?.y ?? 0) + dy }, false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected, elements, historyIndex, history]);

  async function save() {
    setSaving(true);
    const editable_element_ids = elements
      .filter((e) => e.editable)
      .map((e) => ({ id: e.id, type: e.type, label: (e as any).editableLabel ?? "Untitled field" }));
    await supabase
      .from("flier_templates")
      .update({
        name,
        category: category || null,
        canvas_width: canvasWidth,
        canvas_height: canvasHeight,
        canvas_background: background,
        canvas_data: elements,
        editable_element_ids,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const toolbarBtn = "text-[11px] px-2.5 py-2 rounded-lg cursor-pointer text-center flex flex-col items-center gap-0.5";

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mt-4 mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-bold bg-transparent border-none outline-none"
            style={{ minWidth: 180 }}
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="text-sm px-2 py-1 rounded"
            style={{ border: "1px solid var(--portal-line)", width: 130 }}
          />
          <select
            onChange={(e) => {
              const preset = CANVAS_SIZE_PRESETS[Number(e.target.value)];
              if (preset) {
                setCanvasWidth(preset.width);
                setCanvasHeight(preset.height);
              }
            }}
            className="text-xs px-2 py-1.5 rounded"
            style={{ border: "1px solid var(--portal-line)" }}
            defaultValue=""
          >
            <option value="" disabled>
              Canvas size…
            </option>
            {CANVAS_SIZE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label} ({p.width}×{p.height})
              </option>
            ))}
          </select>
          <input
            type="color"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            title="Canvas background"
            className="w-7 h-7 rounded cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs" style={{ color: "var(--portal-emerald)" }}>Saved ✓</span>}
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-5 py-2 rounded-lg text-white font-medium cursor-pointer disabled:opacity-60"
            style={{ background: "var(--portal-emerald)" }}
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>

      {/* Action bar: undo/redo, align, layers, zoom */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap p-2 rounded-lg" style={{ background: "white", border: "1px solid var(--portal-line)" }}>
        <IconBtn onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)"><Icon.Undo /></IconBtn>
        <IconBtn onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"><Icon.Redo /></IconBtn>
        <Divider />
        <IconBtn onClick={duplicateSelected} disabled={!selected} title="Duplicate (Ctrl+D)"><Icon.Duplicate /></IconBtn>
        <IconBtn onClick={deleteSelected} disabled={!selected} title="Delete"><Icon.Delete /></IconBtn>
        <Divider />
        <IconBtn onClick={() => align("left")} disabled={!selected} title="Align left"><Icon.AlignLeft /></IconBtn>
        <IconBtn onClick={() => align("hcenter")} disabled={!selected} title="Align center"><Icon.AlignCenterH /></IconBtn>
        <IconBtn onClick={() => align("right")} disabled={!selected} title="Align right"><Icon.AlignRight /></IconBtn>
        <IconBtn onClick={() => align("top")} disabled={!selected} title="Align top"><Icon.AlignTop /></IconBtn>
        <IconBtn onClick={() => align("vcenter")} disabled={!selected} title="Align middle"><Icon.AlignCenterV /></IconBtn>
        <IconBtn onClick={() => align("bottom")} disabled={!selected} title="Align bottom"><Icon.AlignBottom /></IconBtn>
        <Divider />
        <IconBtn onClick={() => reorder("front")} disabled={!selected} title="Bring to front"><Icon.BringFront /></IconBtn>
        <IconBtn onClick={() => reorder("forward")} disabled={!selected} title="Bring forward"><Icon.BringForward /></IconBtn>
        <IconBtn onClick={() => reorder("backward")} disabled={!selected} title="Send backward"><Icon.SendBackward /></IconBtn>
        <IconBtn onClick={() => reorder("back")} disabled={!selected} title="Send to back"><Icon.SendBack /></IconBtn>
        <Divider />
        <IconBtn onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))} title="Zoom out"><Icon.ZoomOut /></IconBtn>
        <span className="text-xs w-10 text-center" style={{ color: "rgba(22,48,43,0.5)" }}>
          {Math.round(zoom * 100)}%
        </span>
        <IconBtn onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} title="Zoom in"><Icon.ZoomIn /></IconBtn>
        <IconBtn onClick={() => setZoom(0.42)} title="Reset zoom"><Icon.ZoomReset /></IconBtn>
      </div>

      <div className="flex gap-3">
        {/* Toolbar */}
        <div className="flex flex-col gap-1.5 w-16 flex-shrink-0">
          <button onClick={() => addElement(newTextElement())} className={toolbarBtn} style={{ border: "1px solid var(--portal-line)", background: "white" }} title="Add text">
            <span style={{ width: 18, height: 18 }}>{ICONS.text}</span>
            Text
          </button>
          <button onClick={() => addElement(newImageElement())} className={toolbarBtn} style={{ border: "1px solid var(--portal-line)", background: "white" }} title="Add image">
            <span style={{ width: 18, height: 18 }}>{ICONS.image}</span>
            Image
          </button>
          <button onClick={() => addElement(newRectElement())} className={toolbarBtn} style={{ border: "1px solid var(--portal-line)", background: "white" }} title="Add rectangle">
            <span style={{ width: 18, height: 18 }}>{ICONS.rect}</span>
            Rect
          </button>
          <button onClick={() => addElement(newCircleElement())} className={toolbarBtn} style={{ border: "1px solid var(--portal-line)", background: "white" }} title="Add circle">
            <span style={{ width: 18, height: 18 }}>{ICONS.circle}</span>
            Circle
          </button>
          <button onClick={() => addElement(newLineElement())} className={toolbarBtn} style={{ border: "1px solid var(--portal-line)", background: "white" }} title="Add line">
            <span style={{ width: 18, height: 18 }}>{ICONS.line}</span>
            Line
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-shrink-0 overflow-auto" style={{ border: "1px solid var(--portal-line)", borderRadius: 8, maxHeight: 640 }}>
          <FlierCanvas
            width={canvasWidth}
            height={canvasHeight}
            background={background}
            elements={elements}
            mode="builder"
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={setElements}
            onCommit={commit}
            scale={zoom}
          />
        </div>

        {/* Properties panel */}
        <div className="flex-1 min-w-[220px] space-y-3">
          {!selected ? (
            <p className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
              Select an element on the canvas to edit it, or add a new one from the toolbar. Double-click
              text to edit it directly. Arrow keys nudge; hold Shift to move faster.
            </p>
          ) : (
            <div className="rounded-xl bg-white p-4 space-y-3" style={{ border: "1px solid var(--portal-line)" }}>
              <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(22,48,43,0.5)" }}>
                {selected.type}
              </div>

              {selected.type === "text" && (
                <>
                  <textarea
                    value={selected.text}
                    onChange={(e) => updateSelected({ text: e.target.value }, false)}
                    onBlur={(e) => updateSelected({ text: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg px-2 py-1.5 text-sm"
                    style={{ border: "1px solid var(--portal-line)" }}
                  />
                  <select
                    value={selected.fontFamily}
                    onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                    className="w-full rounded-lg px-2 py-1.5 text-sm"
                    style={{ border: "1px solid var(--portal-line)" }}
                  >
                    {BRAND_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={selected.fontSize}
                      onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                      className="w-1/2 rounded-lg px-2 py-1.5 text-sm"
                      style={{ border: "1px solid var(--portal-line)" }}
                    />
                    <select
                      value={selected.fontStyle}
                      onChange={(e) => updateSelected({ fontStyle: e.target.value as any })}
                      className="w-1/2 rounded-lg px-2 py-1.5 text-sm"
                      style={{ border: "1px solid var(--portal-line)" }}
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                      <option value="italic">Italic</option>
                      <option value="bold italic">Bold Italic</option>
                    </select>
                  </div>
                  <div className="flex gap-1.5">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => updateSelected({ align: a })}
                        className="flex-1 text-xs py-1.5 rounded cursor-pointer"
                        style={{
                          border: `1px solid ${selected.align === a ? "var(--portal-emerald)" : "var(--portal-line)"}`,
                          color: selected.align === a ? "var(--portal-emerald)" : "#666",
                        }}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-[10px]" style={{ color: "rgba(22,48,43,0.5)" }}>
                      Letter spacing
                    </label>
                    <input
                      type="number"
                      value={selected.letterSpacing}
                      onChange={(e) => updateSelected({ letterSpacing: Number(e.target.value) })}
                      className="w-16 rounded px-1.5 py-1 text-xs"
                      style={{ border: "1px solid var(--portal-line)" }}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateSelected({ fill: c })}
                        className="w-6 h-6 rounded-full cursor-pointer"
                        style={{ background: c, border: selected.fill === c ? "2px solid var(--portal-gold)" : "1px solid var(--portal-line)" }}
                      />
                    ))}
                    <input
                      type="color"
                      value={selected.fill}
                      onChange={(e) => updateSelected({ fill: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </>
              )}

              {selected.type === "image" && (
                <>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-xs px-3 py-2 rounded-lg cursor-pointer w-full"
                    style={{ border: "1px solid var(--portal-line)" }}
                  >
                    {selected.dropboxPath ? "Change Image" : "Choose Image"}
                  </button>

                  <div className="pt-2" style={{ borderTop: "1px solid var(--portal-line)" }}>
                    <label className="block text-[10px] mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
                      Shape mask
                    </label>
                    <div className="flex gap-1.5">
                      {(["rect", "rounded", "circle"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => updateSelected({ maskShape: m })}
                          className="flex-1 text-xs py-1.5 rounded cursor-pointer capitalize"
                          style={{
                            border: `1px solid ${selected.maskShape === m ? "var(--portal-emerald)" : "var(--portal-line)"}`,
                            color: selected.maskShape === m ? "var(--portal-emerald)" : "#666",
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    {selected.maskShape === "rounded" && (
                      <div className="flex gap-2 items-center mt-1.5">
                        <label className="text-[10px]" style={{ color: "rgba(22,48,43,0.5)" }}>
                          Corner radius
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={Math.min(selected.width, selected.height) / 2}
                          value={selected.maskCornerRadius}
                          onChange={(e) => updateSelected({ maskCornerRadius: Number(e.target.value) }, false)}
                          onMouseUp={(e) => updateSelected({ maskCornerRadius: Number((e.target as HTMLInputElement).value) })}
                          className="flex-1"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-2" style={{ borderTop: "1px solid var(--portal-line)" }}>
                    <label className="block text-[10px] mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
                      Reposition in frame
                    </label>
                    <SliderRow label="Zoom" min={1} max={3} step={0.05} value={selected.cropZoom} onChange={(v) => updateSelected({ cropZoom: v }, false)} onCommit={(v) => updateSelected({ cropZoom: v })} />
                    <SliderRow label="Pan X" min={-1} max={1} step={0.05} value={selected.cropOffsetX} onChange={(v) => updateSelected({ cropOffsetX: v }, false)} onCommit={(v) => updateSelected({ cropOffsetX: v })} />
                    <SliderRow label="Pan Y" min={-1} max={1} step={0.05} value={selected.cropOffsetY} onChange={(v) => updateSelected({ cropOffsetY: v }, false)} onCommit={(v) => updateSelected({ cropOffsetY: v })} />
                  </div>

                  <div className="pt-2" style={{ borderTop: "1px solid var(--portal-line)" }}>
                    <label className="block text-[10px] mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
                      Filter
                    </label>
                    <div className="flex gap-1.5 mb-2">
                      {(["none", "grayscale", "sepia"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => updateSelected({ filter: f })}
                          className="flex-1 text-xs py-1.5 rounded cursor-pointer capitalize"
                          style={{
                            border: `1px solid ${selected.filter === f ? "var(--portal-emerald)" : "var(--portal-line)"}`,
                            color: selected.filter === f ? "var(--portal-emerald)" : "#666",
                          }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <SliderRow label="Brightness" min={-1} max={1} step={0.05} value={selected.brightness} onChange={(v) => updateSelected({ brightness: v }, false)} onCommit={(v) => updateSelected({ brightness: v })} />
                    <SliderRow label="Contrast" min={-50} max={50} step={1} value={selected.contrast} onChange={(v) => updateSelected({ contrast: v }, false)} onCommit={(v) => updateSelected({ contrast: v })} />
                    <SliderRow label="Blur" min={0} max={15} step={0.5} value={selected.blur} onChange={(v) => updateSelected({ blur: v }, false)} onCommit={(v) => updateSelected({ blur: v })} />
                  </div>

                  <BorderShadowControls selected={selected} updateSelected={updateSelected} />
                </>
              )}

              {(selected.type === "rect" || selected.type === "circle") && (
                <div className="flex gap-1.5 flex-wrap">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSelected({ fill: c })}
                      className="w-6 h-6 rounded-full cursor-pointer"
                      style={{ background: c, border: (selected as any).fill === c ? "2px solid var(--portal-gold)" : "1px solid var(--portal-line)" }}
                    />
                  ))}
                  <input type="color" value={(selected as any).fill} onChange={(e) => updateSelected({ fill: e.target.value })} className="w-6 h-6 rounded cursor-pointer" />
                </div>
              )}

              {(selected.type === "rect" || selected.type === "circle") && (
                <BorderShadowControls selected={selected} updateSelected={updateSelected} />
              )}

              {selected.type === "rect" && (
                <div className="flex gap-2 items-center">
                  <label className="text-[10px]" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Corner radius
                  </label>
                  <input
                    type="number"
                    value={selected.cornerRadius}
                    onChange={(e) => updateSelected({ cornerRadius: Number(e.target.value) })}
                    className="w-16 rounded px-1.5 py-1 text-xs"
                    style={{ border: "1px solid var(--portal-line)" }}
                  />
                </div>
              )}

              {selected.type === "line" && (
                <>
                  <div className="flex gap-1.5 flex-wrap">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateSelected({ stroke: c })}
                        className="w-6 h-6 rounded-full cursor-pointer"
                        style={{ background: c, border: (selected as any).stroke === c ? "2px solid var(--portal-gold)" : "1px solid var(--portal-line)" }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-[10px]" style={{ color: "rgba(22,48,43,0.5)" }}>
                      Thickness
                    </label>
                    <input
                      type="number"
                      value={selected.strokeWidth}
                      onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) })}
                      className="w-16 rounded px-1.5 py-1 text-xs"
                      style={{ border: "1px solid var(--portal-line)" }}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 items-center pt-1" style={{ borderTop: "1px solid var(--portal-line)" }}>
                <label className="text-[10px] pt-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                  Opacity
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={(selected as any).opacity ?? 1}
                  onChange={(e) => updateSelected({ opacity: Number(e.target.value) } as any, false)}
                  onMouseUp={(e) => updateSelected({ opacity: Number((e.target as HTMLInputElement).value) } as any)}
                  className="flex-1"
                />
              </div>

              {selected.type !== "rect" && selected.type !== "circle" && selected.type !== "line" && (
                <div className="pt-2" style={{ borderTop: "1px solid var(--portal-line)" }}>
                  <label className="flex items-center gap-2 text-xs mb-2">
                    <input
                      type="checkbox"
                      checked={selected.editable}
                      onChange={(e) => updateSelected({ editable: e.target.checked })}
                    />
                    Editable by field offices
                  </label>
                  {selected.editable && (
                    <input
                      value={(selected as any).editableLabel ?? ""}
                      onChange={(e) => updateSelected({ editableLabel: e.target.value } as any, false)}
                      onBlur={(e) => updateSelected({ editableLabel: e.target.value } as any)}
                      placeholder="Field label (e.g. Event Title)"
                      className="w-full rounded-lg px-2 py-1.5 text-xs"
                      style={{ border: "1px solid var(--portal-line)" }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Layers list */}
          <div className="rounded-xl bg-white p-3" style={{ border: "1px solid var(--portal-line)" }}>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "rgba(22,48,43,0.5)" }}>
              Layers ({elements.length})
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {[...elements].reverse().map((el) => (
                <button
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded cursor-pointer flex items-center gap-2"
                  style={{
                    background: selectedId === el.id ? "#F3F8F6" : "transparent",
                    color: selectedId === el.id ? "var(--portal-emerald)" : "#444",
                  }}
                >
                  <span style={{ width: 14, height: 14, display: "inline-block" }}>{ICONS[el.type as keyof typeof ICONS]}</span>
                  <span className="truncate">
                    {el.type === "text" ? el.text.slice(0, 20) || "Text" : el.type}
                    {(el as any).editable ? " · editable" : ""}
                  </span>
                </button>
              ))}
              {elements.length === 0 && (
                <p className="text-xs" style={{ color: "rgba(22,48,43,0.4)" }}>
                  No elements yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <ApprovedImagePicker
          onClose={() => setPickerOpen(false)}
          onSelect={(img) => {
            updateSelected({ dropboxPath: img.dropbox_path, imageUrl: img.link } as any);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5"
      style={{ color: "#333" }}
    >
      <span style={{ width: 16, height: 16, display: "inline-block" }}>{children}</span>
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 mx-1" style={{ background: "var(--portal-line)" }} />;
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div className="flex gap-2 items-center mb-1">
      <label className="text-[10px] w-14 flex-shrink-0" style={{ color: "rgba(22,48,43,0.5)" }}>
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="flex-1"
      />
    </div>
  );
}

function BorderShadowControls({ selected, updateSelected }: { selected: any; updateSelected: (patch: any, commit?: boolean) => void }) {
  return (
    <div className="pt-2 space-y-2" style={{ borderTop: "1px solid var(--portal-line)" }}>
      <div className="flex gap-2 items-center">
        <label className="text-[10px] w-14 flex-shrink-0" style={{ color: "rgba(22,48,43,0.5)" }}>
          Border
        </label>
        <input
          type="range"
          min={0}
          max={12}
          value={selected.borderWidth}
          onChange={(e) => updateSelected({ borderWidth: Number(e.target.value) }, false)}
          onMouseUp={(e) => updateSelected({ borderWidth: Number((e.target as HTMLInputElement).value) })}
          className="flex-1"
        />
        <input
          type="color"
          value={selected.borderColor}
          onChange={(e) => updateSelected({ borderColor: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer flex-shrink-0"
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={selected.shadow} onChange={(e) => updateSelected({ shadow: e.target.checked })} />
        Drop shadow
      </label>
    </div>
  );
}
