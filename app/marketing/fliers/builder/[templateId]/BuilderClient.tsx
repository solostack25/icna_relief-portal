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

const PANEL = { border: "1px solid var(--portal-line)", boxShadow: "0 1px 3px rgba(22,48,43,0.06)" };
const DIM = "rgba(22,48,43,0.5)";

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
  const [panelTab, setPanelTab] = useState<"style" | "effects">("style");

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

  useEffect(() => {
    setPanelTab("style");
  }, [selectedId]);

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

  const hasEffectsTab = !!selected && selected.type !== "line";

  return (
    <div>
      <div className="flex items-center justify-between mt-4 mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap rounded-2xl bg-white px-4 py-2.5" style={PANEL}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-base font-bold bg-transparent border-none outline-none"
            style={{ minWidth: 160 }}
          />
          <VDivider />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="text-sm bg-transparent border-none outline-none"
            style={{ width: 110, color: "#444" }}
          />
          <VDivider />
          <select
            onChange={(e) => {
              const preset = CANVAS_SIZE_PRESETS[Number(e.target.value)];
              if (preset) {
                setCanvasWidth(preset.width);
                setCanvasHeight(preset.height);
              }
            }}
            className="text-sm bg-transparent border-none outline-none cursor-pointer"
            style={{ color: "#444" }}
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
          <VDivider />
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: DIM }}>
              Background
            </span>
            <input
              type="color"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              className="w-6 h-6 rounded-md cursor-pointer"
              style={{ border: "1px solid var(--portal-line)" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs font-medium" style={{ color: "var(--portal-emerald)" }}>
              Saved ✓
            </span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-6 py-2.5 rounded-xl text-white font-semibold cursor-pointer disabled:opacity-60"
            style={{ background: "var(--portal-emerald)", boxShadow: "0 2px 8px rgba(31,111,84,0.3)" }}
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PillGroup>
          <IconBtn onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)"><Icon.Undo /></IconBtn>
          <IconBtn onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"><Icon.Redo /></IconBtn>
        </PillGroup>
        <PillGroup>
          <IconBtn onClick={duplicateSelected} disabled={!selected} title="Duplicate (Ctrl+D)"><Icon.Duplicate /></IconBtn>
          <IconBtn onClick={deleteSelected} disabled={!selected} title="Delete"><Icon.Delete /></IconBtn>
        </PillGroup>
        <PillGroup>
          <IconBtn onClick={() => align("left")} disabled={!selected} title="Align left"><Icon.AlignLeft /></IconBtn>
          <IconBtn onClick={() => align("hcenter")} disabled={!selected} title="Align center"><Icon.AlignCenterH /></IconBtn>
          <IconBtn onClick={() => align("right")} disabled={!selected} title="Align right"><Icon.AlignRight /></IconBtn>
          <IconBtn onClick={() => align("top")} disabled={!selected} title="Align top"><Icon.AlignTop /></IconBtn>
          <IconBtn onClick={() => align("vcenter")} disabled={!selected} title="Align middle"><Icon.AlignCenterV /></IconBtn>
          <IconBtn onClick={() => align("bottom")} disabled={!selected} title="Align bottom"><Icon.AlignBottom /></IconBtn>
        </PillGroup>
        <PillGroup>
          <IconBtn onClick={() => reorder("front")} disabled={!selected} title="Bring to front"><Icon.BringFront /></IconBtn>
          <IconBtn onClick={() => reorder("forward")} disabled={!selected} title="Bring forward"><Icon.BringForward /></IconBtn>
          <IconBtn onClick={() => reorder("backward")} disabled={!selected} title="Send backward"><Icon.SendBackward /></IconBtn>
          <IconBtn onClick={() => reorder("back")} disabled={!selected} title="Send to back"><Icon.SendBack /></IconBtn>
        </PillGroup>
        <PillGroup>
          <IconBtn onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))} title="Zoom out"><Icon.ZoomOut /></IconBtn>
          <span className="text-xs w-10 text-center font-medium" style={{ color: DIM }}>
            {Math.round(zoom * 100)}%
          </span>
          <IconBtn onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} title="Zoom in"><Icon.ZoomIn /></IconBtn>
          <IconBtn onClick={() => setZoom(0.42)} title="Reset zoom"><Icon.ZoomReset /></IconBtn>
        </PillGroup>
      </div>

      <div className="flex gap-3 items-start">
        <div className="flex flex-col gap-2 w-[64px] flex-shrink-0 rounded-2xl bg-white p-2" style={PANEL}>
          <RailBtn onClick={() => addElement(newTextElement())} label="Text" icon={ICONS.text} />
          <RailBtn onClick={() => addElement(newImageElement())} label="Image" icon={ICONS.image} />
          <RailBtn onClick={() => addElement(newRectElement())} label="Rect" icon={ICONS.rect} />
          <RailBtn onClick={() => addElement(newCircleElement())} label="Circle" icon={ICONS.circle} />
          <RailBtn onClick={() => addElement(newLineElement())} label="Line" icon={ICONS.line} />
        </div>

        <div
          className="flex-1 rounded-2xl overflow-auto flex items-center justify-center p-8"
          style={{ background: "#E7E9EA", minHeight: 500, maxHeight: 680 }}
        >
          <div style={{ boxShadow: "0 12px 40px rgba(16,24,22,0.22)", borderRadius: 6, overflow: "hidden" }}>
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
        </div>

        <div className="w-[268px] flex-shrink-0 space-y-3">
          <div className="rounded-2xl bg-white overflow-hidden" style={PANEL}>
            {!selected ? (
              <p className="text-xs p-4" style={{ color: "rgba(22,48,43,0.45)" }}>
                Select an element on the canvas to edit it, or add a new one from the left. Double-click
                text to edit it directly. Arrow keys nudge; hold Shift to move faster.
              </p>
            ) : (
              <>
                <div className="flex items-center" style={{ borderBottom: "1px solid var(--portal-line)" }}>
                  <TabBtn active={panelTab === "style"} onClick={() => setPanelTab("style")} icon={<Icon.Style />} label="Style" />
                  {hasEffectsTab && (
                    <TabBtn active={panelTab === "effects"} onClick={() => setPanelTab("effects")} icon={<Icon.Effects />} label="Effects" />
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {panelTab === "style" && (
                    <>
                      {selected.type === "text" && (
                        <>
                          <textarea
                            value={selected.text}
                            onChange={(e) => updateSelected({ text: e.target.value }, false)}
                            onBlur={(e) => updateSelected({ text: e.target.value })}
                            rows={2}
                            className="w-full rounded-lg px-2.5 py-2 text-sm"
                            style={{ border: "1px solid var(--portal-line)" }}
                          />
                          <select
                            value={selected.fontFamily}
                            onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                            className="w-full rounded-lg px-2.5 py-2 text-sm"
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
                              className="w-1/2 rounded-lg px-2.5 py-2 text-sm"
                              style={{ border: "1px solid var(--portal-line)" }}
                            />
                            <div className="flex flex-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--portal-line)" }}>
                              <ToggleIconBtn
                                active={selected.fontStyle.includes("bold")}
                                onClick={() => updateSelected({ fontStyle: toggleStyle(selected.fontStyle, "bold") as any })}
                                icon={<Icon.Bold />}
                              />
                              <ToggleIconBtn
                                active={selected.fontStyle.includes("italic")}
                                onClick={() => updateSelected({ fontStyle: toggleStyle(selected.fontStyle, "italic") as any })}
                                icon={<Icon.Italic />}
                              />
                              <ToggleIconBtn active={selected.align === "left"} onClick={() => updateSelected({ align: "left" })} icon={<Icon.AlignLeft />} />
                              <ToggleIconBtn active={selected.align === "center"} onClick={() => updateSelected({ align: "center" })} icon={<Icon.AlignCenterH />} />
                              <ToggleIconBtn active={selected.align === "right"} onClick={() => updateSelected({ align: "right" })} icon={<Icon.AlignRight />} />
                            </div>
                          </div>
                          <SliderRow
                            label="Letter sp."
                            min={-2}
                            max={20}
                            step={1}
                            value={selected.letterSpacing}
                            onChange={(v) => updateSelected({ letterSpacing: v }, false)}
                            onCommit={(v) => updateSelected({ letterSpacing: v })}
                          />
                          <ColorSwatchRow value={selected.fill} onChange={(c) => updateSelected({ fill: c })} />
                        </>
                      )}

                      {selected.type === "image" && (
                        <button
                          onClick={() => setPickerOpen(true)}
                          className="text-xs px-3 py-2.5 rounded-lg cursor-pointer w-full font-medium flex items-center justify-center gap-2"
                          style={{ border: "1.5px solid var(--portal-emerald)", color: "var(--portal-emerald)" }}
                        >
                          <span style={{ width: 14, height: 14 }}>
                            <Icon.ImagePicker />
                          </span>
                          {selected.dropboxPath ? "Change Image" : "Choose Image"}
                        </button>
                      )}

                      {(selected.type === "rect" || selected.type === "circle") && (
                        <ColorSwatchRow value={(selected as any).fill} onChange={(c) => updateSelected({ fill: c })} />
                      )}

                      {selected.type === "rect" && (
                        <SliderRow
                          label="Corners"
                          min={0}
                          max={Math.min(selected.width, selected.height) / 2}
                          step={1}
                          value={selected.cornerRadius}
                          onChange={(v) => updateSelected({ cornerRadius: v }, false)}
                          onCommit={(v) => updateSelected({ cornerRadius: v })}
                        />
                      )}

                      {selected.type === "line" && (
                        <>
                          <ColorSwatchRow value={selected.stroke} onChange={(c) => updateSelected({ stroke: c })} />
                          <SliderRow
                            label="Thickness"
                            min={1}
                            max={20}
                            step={1}
                            value={selected.strokeWidth}
                            onChange={(v) => updateSelected({ strokeWidth: v }, false)}
                            onCommit={(v) => updateSelected({ strokeWidth: v })}
                          />
                        </>
                      )}
                    </>
                  )}

                  {panelTab === "effects" && selected.type === "image" && (
                    <>
                      <PanelLabel>Shape mask</PanelLabel>
                      <div className="flex gap-1.5">
                        {(["rect", "rounded", "circle"] as const).map((m) => (
                          <SegBtn key={m} active={selected.maskShape === m} onClick={() => updateSelected({ maskShape: m })}>
                            {m}
                          </SegBtn>
                        ))}
                      </div>
                      {selected.maskShape === "rounded" && (
                        <SliderRow
                          label="Radius"
                          min={0}
                          max={Math.min(selected.width, selected.height) / 2}
                          step={1}
                          value={selected.maskCornerRadius}
                          onChange={(v) => updateSelected({ maskCornerRadius: v }, false)}
                          onCommit={(v) => updateSelected({ maskCornerRadius: v })}
                        />
                      )}

                      <PanelDivider />
                      <PanelLabel>Reposition in frame</PanelLabel>
                      <SliderRow label="Zoom" min={1} max={3} step={0.05} value={selected.cropZoom} onChange={(v) => updateSelected({ cropZoom: v }, false)} onCommit={(v) => updateSelected({ cropZoom: v })} />
                      <SliderRow label="Pan X" min={-1} max={1} step={0.05} value={selected.cropOffsetX} onChange={(v) => updateSelected({ cropOffsetX: v }, false)} onCommit={(v) => updateSelected({ cropOffsetX: v })} />
                      <SliderRow label="Pan Y" min={-1} max={1} step={0.05} value={selected.cropOffsetY} onChange={(v) => updateSelected({ cropOffsetY: v }, false)} onCommit={(v) => updateSelected({ cropOffsetY: v })} />

                      <PanelDivider />
                      <PanelLabel>Filter</PanelLabel>
                      <div className="flex gap-1.5 mb-1">
                        {(["none", "grayscale", "sepia"] as const).map((f) => (
                          <SegBtn key={f} active={selected.filter === f} onClick={() => updateSelected({ filter: f })}>
                            {f}
                          </SegBtn>
                        ))}
                      </div>
                      <SliderRow label="Bright." min={-1} max={1} step={0.05} value={selected.brightness} onChange={(v) => updateSelected({ brightness: v }, false)} onCommit={(v) => updateSelected({ brightness: v })} />
                      <SliderRow label="Contrast" min={-50} max={50} step={1} value={selected.contrast} onChange={(v) => updateSelected({ contrast: v }, false)} onCommit={(v) => updateSelected({ contrast: v })} />
                      <SliderRow label="Blur" min={0} max={15} step={0.5} value={selected.blur} onChange={(v) => updateSelected({ blur: v }, false)} onCommit={(v) => updateSelected({ blur: v })} />

                      <PanelDivider />
                      <BorderShadowOpacityControls selected={selected} updateSelected={updateSelected} />
                    </>
                  )}

                  {panelTab === "effects" && (selected.type === "rect" || selected.type === "circle") && (
                    <BorderShadowOpacityControls selected={selected} updateSelected={updateSelected} />
                  )}

                  {panelTab === "effects" && selected.type === "text" && (
                    <SliderRow
                      label="Opacity"
                      min={0}
                      max={1}
                      step={0.05}
                      value={(selected as any).opacity ?? 1}
                      onChange={(v) => updateSelected({ opacity: v } as any, false)}
                      onCommit={(v) => updateSelected({ opacity: v } as any)}
                    />
                  )}

                  {selected.type !== "rect" && selected.type !== "circle" && selected.type !== "line" && (
                    <div className="pt-3" style={{ borderTop: "1px solid var(--portal-line)" }}>
                      <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer">
                        <input type="checkbox" checked={selected.editable} onChange={(e) => updateSelected({ editable: e.target.checked })} />
                        Editable by field offices
                      </label>
                      {selected.editable && (
                        <input
                          value={(selected as any).editableLabel ?? ""}
                          onChange={(e) => updateSelected({ editableLabel: e.target.value } as any, false)}
                          onBlur={(e) => updateSelected({ editableLabel: e.target.value } as any)}
                          placeholder="Field label (e.g. Event Title)"
                          className="w-full rounded-lg px-2.5 py-2 text-xs"
                          style={{ border: "1px solid var(--portal-line)" }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl bg-white p-3" style={PANEL}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-2 px-1" style={{ color: DIM }}>
              <span style={{ width: 12, height: 12 }}>
                <Icon.Layers />
              </span>
              Layers ({elements.length})
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {[...elements].reverse().map((el) => (
                <button
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className="w-full text-left text-xs px-2.5 py-2 rounded-lg cursor-pointer flex items-center gap-2 transition-colors"
                  style={{
                    background: selectedId === el.id ? "#F3F8F6" : "transparent",
                    color: selectedId === el.id ? "var(--portal-emerald)" : "#444",
                  }}
                >
                  <span style={{ width: 14, height: 14, display: "inline-block", flexShrink: 0 }}>{ICONS[el.type as keyof typeof ICONS]}</span>
                  <span className="truncate">
                    {el.type === "text" ? el.text.slice(0, 20) || "Text" : el.type}
                    {(el as any).editable ? " · editable" : ""}
                  </span>
                </button>
              ))}
              {elements.length === 0 && (
                <p className="text-xs px-1" style={{ color: "rgba(22,48,43,0.4)" }}>
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

function toggleStyle(current: string, kind: "bold" | "italic"): string {
  const hasBold = current.includes("bold");
  const hasItalic = current.includes("italic");
  const nextBold = kind === "bold" ? !hasBold : hasBold;
  const nextItalic = kind === "italic" ? !hasItalic : hasItalic;
  if (nextBold && nextItalic) return "bold italic";
  if (nextBold) return "bold";
  if (nextItalic) return "italic";
  return "normal";
}

function VDivider() {
  return <div className="w-px h-5" style={{ background: "var(--portal-line)" }} />;
}

function PillGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-white px-2 py-1.5" style={PANEL}>
      {children}
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
      className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/[0.06] transition-colors"
      style={{ color: "#333" }}
    >
      <span style={{ width: 15, height: 15, display: "inline-block" }}>{children}</span>
    </button>
  );
}

function RailBtn({ onClick, label, icon }: { onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={`Add ${label}`}
      className="flex flex-col items-center gap-1 py-2.5 rounded-xl cursor-pointer hover:bg-black/[0.04] transition-colors"
    >
      <span style={{ width: 18, height: 18, color: "#333" }}>{icon}</span>
      <span className="text-[10px]" style={{ color: DIM }}>
        {label}
      </span>
    </button>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 cursor-pointer transition-colors"
      style={{
        color: active ? "var(--portal-emerald)" : DIM,
        borderBottom: active ? "2px solid var(--portal-emerald)" : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      <span style={{ width: 13, height: 13 }}>{icon}</span>
      {label}
    </button>
  );
}

function ToggleIconBtn({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center py-1.5 cursor-pointer transition-colors"
      style={{ background: active ? "var(--portal-emerald)" : "transparent", color: active ? "white" : "#555" }}
    >
      <span style={{ width: 14, height: 14 }}>{icon}</span>
    </button>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 text-xs py-1.5 rounded-lg cursor-pointer capitalize transition-colors"
      style={{
        border: `1px solid ${active ? "var(--portal-emerald)" : "var(--portal-line)"}`,
        color: active ? "var(--portal-emerald)" : "#666",
        background: active ? "#F3F8F6" : "white",
      }}
    >
      {children}
    </button>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: DIM }}>
      {children}
    </div>
  );
}

function PanelDivider() {
  return <div className="my-1" style={{ borderTop: "1px solid var(--portal-line)" }} />;
}

function ColorSwatchRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {BRAND_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full cursor-pointer flex-shrink-0 transition-transform hover:scale-110"
          style={{
            background: c,
            border: value === c ? "2px solid var(--portal-gold)" : "1px solid var(--portal-line)",
          }}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-6 h-6 rounded-full cursor-pointer flex-shrink-0" title="Custom color" />
    </div>
  );
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
      <label className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
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
        style={{ accentColor: "var(--portal-emerald)" }}
      />
      <span className="text-[10px] w-8 text-right flex-shrink-0" style={{ color: DIM }}>
        {Math.round(value * 100) / 100}
      </span>
    </div>
  );
}

function BorderShadowOpacityControls({ selected, updateSelected }: { selected: any; updateSelected: (patch: any, commit?: boolean) => void }) {
  return (
    <div className="space-y-2">
      <PanelLabel>Border &amp; shadow</PanelLabel>
      <div className="flex gap-2 items-center">
        <label className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
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
          style={{ accentColor: "var(--portal-emerald)" }}
        />
        <input
          type="color"
          value={selected.borderColor}
          onChange={(e) => updateSelected({ borderColor: e.target.value })}
          className="w-6 h-6 rounded-full cursor-pointer flex-shrink-0"
        />
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={selected.shadow} onChange={(e) => updateSelected({ shadow: e.target.checked })} />
        Drop shadow
      </label>
      <PanelDivider />
      <SliderRow
        label="Opacity"
        min={0}
        max={1}
        step={0.05}
        value={selected.opacity ?? 1}
        onChange={(v) => updateSelected({ opacity: v }, false)}
        onCommit={(v) => updateSelected({ opacity: v })}
      />
    </div>
  );
}
