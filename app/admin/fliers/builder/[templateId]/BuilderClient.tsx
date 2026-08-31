"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  type FlierElement,
  BRAND_FONTS,
  BRAND_COLORS,
  CANVAS_SIZE_PRESETS,
  resizeElementsToCanvas,
  newTextElement,
  newImageElement,
  newRectElement,
  newCircleElement,
  newLineElement,
  newStarElement,
  newPolygonElement,
  newArrowElement,
  newIconElement,
} from "@/lib/flierElements";
import { ICON_LIBRARY } from "@/lib/flierIcons";
import ApprovedImagePicker from "../../ApprovedImagePicker";
import { Icon } from "../../icons";

const FlierCanvas = dynamic(() => import("@/components/FlierCanvas"), { ssr: false });

const ICONS = {
  text: <Icon.TextTool />,
  image: <Icon.ImageTool />,
  rect: <Icon.RectTool />,
  circle: <Icon.CircleTool />,
  line: <Icon.LineTool />,
  star: <Icon.CircleTool />,
  polygon: <Icon.RectTool />,
  arrow: <Icon.AlignRight />,
  icon: <Icon.Style />,
};

const presetGroups = [...new Set(CANVAS_SIZE_PRESETS.map((p) => p.group))];

const PANEL = { border: "1px solid var(--portal-line)", boxShadow: "0 1px 3px rgba(22,48,43,0.06)" };
const DIM = "rgba(22,48,43,0.5)";

export default function BuilderClient({ template }: { template: any }) {
  const supabase = createClient();

  const [showTip, setShowTip] = useState(false);
  useEffect(() => {
    setShowTip(localStorage.getItem("flierBuilderTipDismissed") !== "1");
  }, []);
  function dismissTip() {
    localStorage.setItem("flierBuilderTipDismissed", "1");
    setShowTip(false);
  }

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
  const [activeRailPanel, setActiveRailPanel] = useState<null | "elements" | "photos">(null);
  const [effectsDrawer, setEffectsDrawer] = useState<null | "shape" | "crop" | "filter" | "border">(null);
  const [styleDrawer, setStyleDrawer] = useState<null | "font" | "color" | "fill" | "rectShape">(null);
  const [zoom, setZoom] = useState(0.42);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // "Fit" zoom: as much of the container as the flier can use, leaving
  // room to breathe (40px padding) and never exceeding 1.5x (matches
  // the manual zoom-in cap). Recomputed whenever the container resizes
  // - which includes the sidebar being collapsed/expanded, since that
  // changes how much horizontal room this column has, not just an
  // actual window resize.
  const fitZoom = useCallback(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const availW = el.clientWidth - 40;
    const availH = el.clientHeight - 40;
    if (availW <= 0 || availH <= 0) return;
    const next = Math.min(availW / canvasWidth, availH / canvasHeight, 1.5);
    setZoom(Math.max(0.15, next));
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    fitZoom();
    const el = canvasAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => fitZoom());
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitZoom]);
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
    setEffectsDrawer(null);
    setStyleDrawer(null);
  }, [selectedId]);

  function addElement(el: FlierElement) {
    commit([...elements, el]);
    setSelectedId(el.id);
  }
  // Rail-triggered Photos panel always adds a new filled image element per
  // click - matches Canva's actual behavior (clicking a thumbnail in the
  // Photos tab drops a new photo on the canvas, it never silently replaces
  // whatever happens to be selected). The Style panel's own "Choose/Change
  // Image" button is the separate, deliberate "replace this specific
  // element's photo" action and keeps its own pickerOpen + updateSelected
  // flow untouched.
  function addPhoto(img: { dropbox_path: string | null; link: string }) {
    addElement(newImageElement({ dropboxPath: img.dropbox_path, imageUrl: img.link }));
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

  function resizeTo(newWidth: number, newHeight: number) {
    const resized = resizeElementsToCanvas(elements, canvasWidth, canvasHeight, newWidth, newHeight);
    setCanvasWidth(newWidth);
    setCanvasHeight(newHeight);
    commit(resized);
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

  // Shared between the desktop docked panel, the mobile bottom sheet, and
  // (railButtons only) the mobile sticky bar - defined once at component
  // scope so all three stay in sync rather than drifting apart. Mirrors
  // Canva's own "Elements" tab: shapes and graphics/icons grouped under one
  // category instead of each being its own top-level rail button. Doesn't
  // close the panel/drawer after adding one, since Canva keeps it open so
  // you can drop several shapes or icons onto the canvas in a row.
  const elementsPanelContent = (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "#7A9186" }}>
          Shapes
        </p>
        <div className="grid grid-cols-3 gap-1">
          <ShapeGridBtn label="Rect" icon={ICONS.rect} color="#E2892F" onClick={() => addElement(newRectElement())} />
          <ShapeGridBtn label="Circle" icon={ICONS.circle} color="#2F6D46" onClick={() => addElement(newCircleElement())} />
          <ShapeGridBtn label="Line" icon={ICONS.line} color="#6B5FB5" onClick={() => addElement(newLineElement())} />
          <ShapeGridBtn label="Star" icon={<Icon.CircleTool />} color="#C9A227" onClick={() => addElement(newStarElement())} />
          <ShapeGridBtn label="Polygon" icon={<Icon.RectTool />} color="#3E9E8F" onClick={() => addElement(newPolygonElement())} />
          <ShapeGridBtn label="Arrow" icon={<Icon.AlignRight />} color="#D06A4F" onClick={() => addElement(newArrowElement())} />
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "#7A9186" }}>
          Graphics
        </p>
        <div className="grid grid-cols-5 gap-2">
          {ICON_LIBRARY.map((def) => (
            <button
              key={def.id}
              onClick={() => addElement(newIconElement(def.id))}
              title={def.label}
              className="aspect-square rounded-lg flex items-center justify-center cursor-pointer hover:bg-black/[0.04] transition-colors"
              style={{ border: "1px solid var(--portal-line)" }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  d={def.path}
                  fill={def.mode === "filled" ? "#16302B" : "none"}
                  stroke={def.mode === "stroke" ? "#16302B" : "none"}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mt-4 mb-3 flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-base font-bold outline-none rounded-full px-4 py-2.5"
            style={{ minWidth: 180, background: "#fff", boxShadow: "0 3px 10px rgba(22,48,43,0.07)" }}
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="text-sm font-semibold outline-none rounded-full px-4 py-2.5"
            style={{ width: 130, color: "#3E7FBF", background: "#E9F1FA" }}
          />
          <select
            onChange={(e) => {
              const preset = CANVAS_SIZE_PRESETS[Number(e.target.value)];
              if (preset) {
                setCanvasWidth(preset.width);
                setCanvasHeight(preset.height);
              }
            }}
            className="text-sm font-semibold outline-none cursor-pointer rounded-full px-4 py-2.5"
            style={{ color: "#4F6B5B", background: "#EAF5EE" }}
            defaultValue=""
            title="Set canvas size for a blank template - doesn't move existing elements"
          >
            <option value="" disabled>
              Set size…
            </option>
            {presetGroups.map((group) => (
              <optgroup key={group} label={group}>
                {CANVAS_SIZE_PRESETS.map((p, i) =>
                  p.group === group ? (
                    <option key={p.label} value={i}>
                      {p.label} ({p.width}×{p.height})
                    </option>
                  ) : null
                )}
              </optgroup>
            ))}
          </select>
          <select
            onChange={(e) => {
              const preset = CANVAS_SIZE_PRESETS[Number(e.target.value)];
              if (preset) resizeTo(preset.width, preset.height);
              e.target.value = "";
            }}
            className="text-sm font-bold outline-none cursor-pointer rounded-full px-4 py-2.5"
            style={{ color: "#fff", background: "var(--portal-amber, #E2892F)" }}
            defaultValue=""
            title="Rescale the current design to fit a different platform size"
          >
            <option value="" disabled>
              Resize to…
            </option>
            {presetGroups.map((group) => (
              <optgroup key={group} label={group}>
                {CANVAS_SIZE_PRESETS.map((p, i) =>
                  p.group === group ? (
                    <option key={p.label} value={i}>
                      {p.label} ({p.width}×{p.height})
                    </option>
                  ) : null
                )}
              </optgroup>
            ))}
          </select>
          <div className="flex items-center gap-2 rounded-full px-3.5 py-2" style={{ background: "#fff", boxShadow: "0 3px 10px rgba(22,48,43,0.07)" }}>
            <span className="text-xs font-bold" style={{ color: "#7A9186" }}>
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
            className="text-sm px-6 py-2.5 rounded-full text-white font-bold cursor-pointer disabled:opacity-60 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{ background: "var(--portal-emerald)", boxShadow: "0 3px 10px rgba(31,111,84,0.35)" }}
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>

      {showTip && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 mb-3"
          style={{ background: "#FCEFDD", border: "1px solid #F0D5A8" }}
        >
          <span className="text-sm" style={{ color: "#8A5A1E" }}>
            <span className="font-bold">New here?</span> Click Text, Photos, or Elements on the left to add
            something to your flier, then style it using the panel on the right.
          </span>
          <button onClick={dismissTip} className="text-xs font-bold cursor-pointer flex-shrink-0" style={{ color: "#8A5A1E" }}>
            Got it
          </button>
        </div>
      )}

      {/* Only global, non-selection-dependent controls live in the persistent
          bar now. Everything that only makes sense once something is selected
          (duplicate/delete/align/layer order) moved to the floating toolbar
          that appears directly above the selected element - see renderToolbar
          below. Static always-on rows of disabled icon buttons is the "Paint"
          tell we're moving away from. */}
      <div className="flex items-center justify-between mb-3">
        <LabeledGroup label="Undo / Redo">
          <IconBtn onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)"><Icon.Undo /></IconBtn>
          <IconBtn onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"><Icon.Redo /></IconBtn>
        </LabeledGroup>
        <LabeledGroup label="Zoom">
          <IconBtn onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))} title="Zoom out"><Icon.ZoomOut /></IconBtn>
          <span className="text-xs w-10 text-center font-medium" style={{ color: DIM }}>
            {Math.round(zoom * 100)}%
          </span>
          <IconBtn onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} title="Zoom in"><Icon.ZoomIn /></IconBtn>
          <IconBtn onClick={fitZoom} title="Fit to screen"><Icon.ZoomReset /></IconBtn>
        </LabeledGroup>
      </div>

      {(() => {
        // Shared between the desktop static rail and the mobile docked one
        // below so the two don't drift out of sync.
        const railButtons = (
          <>
            <RailBtn onClick={() => addElement(newTextElement())} label="Text" icon={ICONS.text} color="#3E7FBF" />
            <RailBtn
              onClick={() => setActiveRailPanel((p) => (p === "photos" ? null : "photos"))}
              label="Photos"
              icon={ICONS.image}
              color="#B5566B"
              active={activeRailPanel === "photos"}
              title="Browse photos"
            />
            <RailBtn
              onClick={() => setActiveRailPanel((p) => (p === "elements" ? null : "elements"))}
              label="Elements"
              icon={ICONS.rect}
              color="#E2892F"
              active={activeRailPanel === "elements"}
              title="Browse shapes & icons"
            />
          </>
        );
        return (
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-start">
            <div className="hidden lg:flex lg:flex-col gap-1 w-[72px] flex-shrink-0 rounded-3xl p-2.5" style={{ background: "#fff", boxShadow: "0 4px 16px rgba(22,48,43,0.08)" }}>
              {railButtons}
            </div>

            {/* Docked panel, not an overlay - sits inline in the layout next
                to the rail so the canvas stays interactive/visible while
                browsing, matching Canva's own desktop side-panel behavior.
                Mobile gets the bottom-sheet version further down instead.
                Single panel swapping content by activeRailPanel, rather than
                two independent panels, so Elements and Photos can't both be
                open at once - matches Canva only ever showing one tab's
                panel at a time. */}
            {activeRailPanel && (
              <div
                className="hidden lg:flex lg:flex-col w-[340px] flex-shrink-0 rounded-3xl p-4 overflow-y-auto"
                style={{ background: "#fff", boxShadow: "0 4px 16px rgba(22,48,43,0.08)", maxHeight: "calc(100vh - 300px)" }}
              >
                {activeRailPanel === "elements" ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold">Elements</h3>
                      <button onClick={() => setActiveRailPanel(null)} className="text-sm cursor-pointer" style={{ color: DIM }}>
                        ✕
                      </button>
                    </div>
                    {elementsPanelContent}
                  </>
                ) : (
                  <ApprovedImagePicker docked allowMore onClose={() => setActiveRailPanel(null)} onSelect={addPhoto} />
                )}
              </div>
            )}

        <div
          ref={canvasAreaRef}
          className="flex-1 min-w-0 rounded-3xl overflow-auto flex items-center justify-center p-4 sm:p-8 h-[46vh] min-h-[300px] lg:h-[calc(100vh-300px)] lg:min-h-[560px]"
          style={{ background: "linear-gradient(160deg, #F3F0E8 0%, #EAF2ED 100%)" }}
        >
          <div style={{ boxShadow: "0 16px 44px rgba(31,74,48,0.18)", borderRadius: 10, overflow: "hidden" }}>
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
              renderToolbar={(el) => (
                <FloatingToolbar
                  el={el}
                  onDuplicate={duplicateSelected}
                  onDelete={deleteSelected}
                  onAlign={align}
                  onReorder={reorder}
                />
              )}
            />
          </div>
        </div>

        <div className="w-full lg:w-[268px] flex-shrink-0 space-y-3">
          <div className="rounded-3xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 4px 16px rgba(22,48,43,0.08)" }}>
            {!selected ? (
              <p className="text-xs p-4" style={{ color: "rgba(22,48,43,0.45)" }}>
                Select an element on the canvas to edit it, or add a new one from the left. Double-click
                text to edit it directly. Arrow keys nudge; hold Shift to move faster.
              </p>
            ) : (
              <>
                <div className="flex items-center px-1.5 pt-1.5" style={{ borderBottom: "1.5px solid #F0F4F1" }}>
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
                          <div className="space-y-2 mt-2">
                            <CategoryButton label="Font" onClick={() => setStyleDrawer("font")} />
                            <CategoryButton label="Color & spacing" onClick={() => setStyleDrawer("color")} />
                          </div>

                          <Drawer title="Font" open={styleDrawer === "font"} onClose={() => setStyleDrawer(null)}>
                            <select
                              value={selected.fontFamily}
                              onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                              className="w-full rounded-lg px-2.5 py-2 text-sm mb-2"
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
                          </Drawer>

                          <Drawer title="Color & spacing" open={styleDrawer === "color"} onClose={() => setStyleDrawer(null)}>
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
                          </Drawer>
                        </>
                      )}

                      {selected.type === "image" && (
                        <button
                          onClick={() => setPickerOpen(true)}
                          className="text-xs px-3 py-2.5 rounded-full cursor-pointer w-full font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-transform duration-150"
                          style={{ border: "1.5px solid var(--portal-emerald)", color: "var(--portal-emerald)" }}
                        >
                          <span style={{ width: 14, height: 14 }}>
                            <Icon.ImagePicker />
                          </span>
                          {selected.dropboxPath ? "Change Image" : "Choose Image"}
                        </button>
                      )}

                      {selected.type === "circle" && (
                        <div>
                          <ColorSwatchRow value={selected.fill} onChange={(c) => updateSelected({ fill: c })} />
                          <div className="pt-2">
                            <label className="flex items-center gap-2 text-xs mb-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selected.gradient.enabled}
                                onChange={(e) => updateSelected({ gradient: { ...selected.gradient, enabled: e.target.checked } })}
                              />
                              Gradient fill
                            </label>
                            {selected.gradient.enabled && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={selected.gradient.from}
                                  onChange={(e) => updateSelected({ gradient: { ...selected.gradient, from: e.target.value } })}
                                  className="w-6 h-6 rounded-full cursor-pointer"
                                />
                                <input
                                  type="color"
                                  value={selected.gradient.to}
                                  onChange={(e) => updateSelected({ gradient: { ...selected.gradient, to: e.target.value } })}
                                  className="w-6 h-6 rounded-full cursor-pointer"
                                />
                                <select
                                  value={selected.gradient.direction}
                                  onChange={(e) => updateSelected({ gradient: { ...selected.gradient, direction: e.target.value as any } })}
                                  className="flex-1 rounded-lg px-2 py-1.5 text-xs"
                                  style={{ border: "1px solid var(--portal-line)" }}
                                >
                                  <option value="horizontal">Horizontal</option>
                                  <option value="vertical">Vertical</option>
                                  <option value="diagonal">Diagonal</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {selected.type === "rect" && (
                        <div className="space-y-2">
                          <CategoryButton label="Fill" onClick={() => setStyleDrawer("fill")} />
                          <CategoryButton label="Shape" onClick={() => setStyleDrawer("rectShape")} />

                          <Drawer title="Fill" open={styleDrawer === "fill"} onClose={() => setStyleDrawer(null)}>
                            <ColorSwatchRow value={selected.fill} onChange={(c) => updateSelected({ fill: c })} />
                            <div className="pt-2">
                              <label className="flex items-center gap-2 text-xs mb-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selected.gradient.enabled}
                                  onChange={(e) => updateSelected({ gradient: { ...selected.gradient, enabled: e.target.checked } })}
                                />
                                Gradient fill
                              </label>
                              {selected.gradient.enabled && (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={selected.gradient.from}
                                    onChange={(e) => updateSelected({ gradient: { ...selected.gradient, from: e.target.value } })}
                                    className="w-6 h-6 rounded-full cursor-pointer"
                                  />
                                  <input
                                    type="color"
                                    value={selected.gradient.to}
                                    onChange={(e) => updateSelected({ gradient: { ...selected.gradient, to: e.target.value } })}
                                    className="w-6 h-6 rounded-full cursor-pointer"
                                  />
                                  <select
                                    value={selected.gradient.direction}
                                    onChange={(e) => updateSelected({ gradient: { ...selected.gradient, direction: e.target.value as any } })}
                                    className="flex-1 rounded-lg px-2 py-1.5 text-xs"
                                    style={{ border: "1px solid var(--portal-line)" }}
                                  >
                                    <option value="horizontal">Horizontal</option>
                                    <option value="vertical">Vertical</option>
                                    <option value="diagonal">Diagonal</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          </Drawer>

                          <Drawer title="Shape" open={styleDrawer === "rectShape"} onClose={() => setStyleDrawer(null)}>
                            <SliderRow
                              label="Corners"
                              min={0}
                              max={Math.min(selected.width, selected.height) / 2}
                              step={1}
                              value={selected.cornerRadius}
                              onChange={(v) => updateSelected({ cornerRadius: v }, false)}
                              onCommit={(v) => updateSelected({ cornerRadius: v })}
                            />
                          </Drawer>
                        </div>
                      )}

                      {(selected.type === "star" || selected.type === "polygon" || selected.type === "arrow" || selected.type === "icon") && (
                        <ColorSwatchRow value={(selected as any).fill} onChange={(c) => updateSelected({ fill: c })} />
                      )}

                      {selected.type === "star" && (
                        <SliderRow
                          label="Points"
                          min={3}
                          max={12}
                          step={1}
                          value={selected.numPoints}
                          onChange={(v) => updateSelected({ numPoints: v }, false)}
                          onCommit={(v) => updateSelected({ numPoints: v })}
                        />
                      )}

                      {selected.type === "polygon" && (
                        <SliderRow
                          label="Sides"
                          min={3}
                          max={10}
                          step={1}
                          value={selected.sides}
                          onChange={(v) => updateSelected({ sides: v }, false)}
                          onCommit={(v) => updateSelected({ sides: v })}
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
                      <div className="space-y-2">
                        <CategoryButton label="Shape" onClick={() => setEffectsDrawer("shape")} />
                        <CategoryButton label="Crop & position" onClick={() => setEffectsDrawer("crop")} />
                        <CategoryButton label="Filter" onClick={() => setEffectsDrawer("filter")} />
                        <CategoryButton label="Border & shadow" onClick={() => setEffectsDrawer("border")} />
                      </div>

                      <Drawer title="Shape" open={effectsDrawer === "shape"} onClose={() => setEffectsDrawer(null)}>
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
                      </Drawer>

                      <Drawer title="Crop & position" open={effectsDrawer === "crop"} onClose={() => setEffectsDrawer(null)}>
                        <SliderRow label="Zoom" min={1} max={3} step={0.05} value={selected.cropZoom} onChange={(v) => updateSelected({ cropZoom: v }, false)} onCommit={(v) => updateSelected({ cropZoom: v })} />
                        <SliderRow label="Pan X" min={-1} max={1} step={0.05} value={selected.cropOffsetX} onChange={(v) => updateSelected({ cropOffsetX: v }, false)} onCommit={(v) => updateSelected({ cropOffsetX: v })} />
                        <SliderRow label="Pan Y" min={-1} max={1} step={0.05} value={selected.cropOffsetY} onChange={(v) => updateSelected({ cropOffsetY: v }, false)} onCommit={(v) => updateSelected({ cropOffsetY: v })} />
                      </Drawer>

                      <Drawer title="Filter" open={effectsDrawer === "filter"} onClose={() => setEffectsDrawer(null)}>
                        <div className="flex gap-1.5 mb-1 flex-wrap">
                          {(["none", "grayscale", "sepia", "invert", "posterize", "duotone"] as const).map((f) => (
                            <SegBtn key={f} active={selected.filter === f} onClick={() => updateSelected({ filter: f })}>
                              {f}
                            </SegBtn>
                          ))}
                        </div>
                        {selected.filter === "duotone" && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
                              Shadow / Light
                            </span>
                            <input
                              type="color"
                              value={selected.duotoneShadow}
                              onChange={(e) => updateSelected({ duotoneShadow: e.target.value })}
                              className="w-6 h-6 rounded-full cursor-pointer"
                            />
                            <input
                              type="color"
                              value={selected.duotoneHighlight}
                              onChange={(e) => updateSelected({ duotoneHighlight: e.target.value })}
                              className="w-6 h-6 rounded-full cursor-pointer"
                            />
                          </div>
                        )}

                        {/* Fine-tune sliders stay one level deeper via the existing
                            accordion, inside this drawer - these are the least-used
                            controls for a typical flyer edit (pick a preset and move
                            on), so a second tap is fine for the rare hand-tune. */}
                        <Section title="Adjust" nested>
                          <SliderRow label="Bright." min={-1} max={1} step={0.05} value={selected.brightness} onChange={(v) => updateSelected({ brightness: v }, false)} onCommit={(v) => updateSelected({ brightness: v })} />
                          <SliderRow label="Contrast" min={-50} max={50} step={1} value={selected.contrast} onChange={(v) => updateSelected({ contrast: v }, false)} onCommit={(v) => updateSelected({ contrast: v })} />
                          <SliderRow label="Saturate" min={-2} max={2} step={0.1} value={selected.saturation} onChange={(v) => updateSelected({ saturation: v }, false)} onCommit={(v) => updateSelected({ saturation: v })} />
                          <SliderRow label="Hue" min={0} max={360} step={5} value={selected.hue} onChange={(v) => updateSelected({ hue: v }, false)} onCommit={(v) => updateSelected({ hue: v })} />
                          <SliderRow label="Blur" min={0} max={15} step={0.5} value={selected.blur} onChange={(v) => updateSelected({ blur: v }, false)} onCommit={(v) => updateSelected({ blur: v })} />
                        </Section>
                      </Drawer>

                      <Drawer title="Border & shadow" open={effectsDrawer === "border"} onClose={() => setEffectsDrawer(null)}>
                        <BorderShadowOpacityControls selected={selected} updateSelected={updateSelected} bare />
                      </Drawer>
                    </>
                  )}

                  {panelTab === "effects" && (selected.type === "rect" || selected.type === "circle") && (
                    <>
                      <CategoryButton label="Border & shadow" onClick={() => setEffectsDrawer("border")} />
                      <Drawer title="Border & shadow" open={effectsDrawer === "border"} onClose={() => setEffectsDrawer(null)}>
                        <BorderShadowOpacityControls selected={selected} updateSelected={updateSelected} bare />
                      </Drawer>
                    </>
                  )}

                  {panelTab === "effects" &&
                    (selected.type === "text" || selected.type === "star" || selected.type === "polygon" || selected.type === "arrow" || selected.type === "icon") && (
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

                  {selected.type !== "rect" &&
                    selected.type !== "circle" &&
                    selected.type !== "line" &&
                    selected.type !== "star" &&
                    selected.type !== "polygon" &&
                    selected.type !== "arrow" &&
                    selected.type !== "icon" && (
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

            {/* Mobile-only: docked at the bottom of the viewport (sticky, so
                it reserves its own layout space - no manual spacer needed)
                instead of floating over the tiny zoomed-out canvas. Negative
                margins cancel AdminLayout's page gutter (px-4 sm:px-10) so
                this sits flush with the screen edges like a native bottom
                nav, matching the reference recording. */}
            <div className="lg:hidden sticky bottom-0 z-30 -mx-4 sm:-mx-10">
              {selected && (
                <div className="flex justify-center py-2">
                  <FloatingToolbar el={selected} onDuplicate={duplicateSelected} onDelete={deleteSelected} onAlign={align} onReorder={reorder} />
                </div>
              )}
              <div
                className="flex flex-row gap-1 overflow-x-auto rounded-t-3xl p-2.5"
                style={{ background: "#fff", boxShadow: "0 -4px 16px rgba(22,48,43,0.08)", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
              >
                {railButtons}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mobile-only bottom sheet mirroring the desktop docked panel above -
          single sheet swapping content by activeRailPanel, same content
          sources (elementsPanelContent / docked ApprovedImagePicker) so
          desktop and mobile can't drift apart. lg:hidden on the outer scrim,
          not the shared Drawer component, since Drawer's desktop variant is
          a centered overlay that would duplicate/conflict with the docked
          panel above. */}
      {activeRailPanel && (
        <div
          className="lg:hidden fixed inset-0 flex items-end justify-center z-50"
          style={{ background: "rgba(22,48,43,0.5)" }}
          onClick={() => setActiveRailPanel(null)}
        >
          <div className="bg-white p-5 w-full rounded-t-3xl max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-2">
              <div className="w-9 h-1 rounded-full" style={{ background: "var(--portal-line)" }} />
            </div>
            {activeRailPanel === "elements" ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold">Elements</h3>
                  <button onClick={() => setActiveRailPanel(null)} className="text-sm cursor-pointer" style={{ color: DIM }}>
                    ✕
                  </button>
                </div>
                {elementsPanelContent}
              </>
            ) : (
              <ApprovedImagePicker docked allowMore onClose={() => setActiveRailPanel(null)} onSelect={addPhoto} />
            )}
          </div>
        </div>
      )}

      {pickerOpen && (
        <ApprovedImagePicker
          allowMore
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

// The floating contextual toolbar - positioned by FlierCanvas, content owned
// here. Kept to a single compact pill (Canva's floating toolbar is narrow)
// with Align and Layer order tucked behind small popovers rather than the
// old approach of spelling every option out inline.
function FloatingToolbar({
  el,
  onDuplicate,
  onDelete,
  onAlign,
  onReorder,
}: {
  el: FlierElement;
  onDuplicate: () => void;
  onDelete: () => void;
  onAlign: (pos: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void;
  onReorder: (dir: "front" | "back" | "forward" | "backward") => void;
}) {
  const [open, setOpen] = useState<"align" | "layer" | null>(null);

  return (
    <div className="relative">
      <div
        className="flex items-center gap-0.5 rounded-full px-1.5 py-1.5"
        style={{ background: "#1F2A24", boxShadow: "0 6px 20px rgba(0,0,0,0.28)" }}
        onMouseLeave={() => setOpen(null)}
      >
        <DarkIconBtn onClick={onDuplicate} title="Duplicate (Ctrl+D)"><Icon.Duplicate /></DarkIconBtn>
        <DarkIconBtn onClick={onDelete} title="Delete"><Icon.Delete /></DarkIconBtn>
        <div className="w-px h-5 mx-0.5" style={{ background: "rgba(255,255,255,0.15)" }} />
        <DarkIconBtn onClick={() => setOpen(open === "align" ? null : "align")} title="Align" active={open === "align"}>
          <Icon.AlignCenterH />
        </DarkIconBtn>
        <DarkIconBtn onClick={() => setOpen(open === "layer" ? null : "layer")} title="Layer order" active={open === "layer"}>
          <Icon.BringFront />
        </DarkIconBtn>
      </div>

      {open === "align" && (
        <div
          className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full px-1.5 py-1.5 z-10"
          style={{ background: "#1F2A24", boxShadow: "0 6px 20px rgba(0,0,0,0.28)" }}
        >
          <DarkIconBtn onClick={() => onAlign("left")} title="Align left"><Icon.AlignLeft /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("hcenter")} title="Align center"><Icon.AlignCenterH /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("right")} title="Align right"><Icon.AlignRight /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("top")} title="Align top"><Icon.AlignTop /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("vcenter")} title="Align middle"><Icon.AlignCenterV /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("bottom")} title="Align bottom"><Icon.AlignBottom /></DarkIconBtn>
        </div>
      )}
      {open === "layer" && (
        <div
          className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full px-1.5 py-1.5 z-10"
          style={{ background: "#1F2A24", boxShadow: "0 6px 20px rgba(0,0,0,0.28)" }}
        >
          <DarkIconBtn onClick={() => onReorder("front")} title="Bring to front"><Icon.BringFront /></DarkIconBtn>
          <DarkIconBtn onClick={() => onReorder("forward")} title="Bring forward"><Icon.BringForward /></DarkIconBtn>
          <DarkIconBtn onClick={() => onReorder("backward")} title="Send backward"><Icon.SendBackward /></DarkIconBtn>
          <DarkIconBtn onClick={() => onReorder("back")} title="Send to back"><Icon.SendBack /></DarkIconBtn>
        </div>
      )}
    </div>
  );
}

function DarkIconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors duration-100"
      style={{ color: "#fff", background: active ? "rgba(255,255,255,0.18)" : "transparent" }}
      onMouseEnter={(e) => !active && (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
      onMouseLeave={(e) => !active && (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ width: 15, height: 15, display: "inline-block" }}>{children}</span>
    </button>
  );
}

function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 flex items-end lg:items-center justify-center lg:p-4 z-50"
      style={{ background: "rgba(22,48,43,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white p-5 w-full rounded-t-3xl max-h-[75vh] overflow-y-auto lg:max-w-sm lg:rounded-2xl lg:max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-2 lg:hidden">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--portal-line)" }} />
        </div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">{title}</h3>
          <button onClick={onClose} className="text-sm cursor-pointer" style={{ color: DIM }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// A row that launches a Drawer, replacing what used to be an inline
// accordion Section - tapping it is the only way to reach that category's
// controls now, keeping the properties panel itself down to a short list
// of category names instead of every control being visible at once.
function CategoryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl cursor-pointer transition-colors"
      style={{ background: "#F7FAF8", border: "1px solid var(--portal-line)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#EEF4F0")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#F7FAF8")}
    >
      <span className="text-[13px] font-bold" style={{ color: "#2F4A3E" }}>
        {label}
      </span>
      <span style={{ width: 13, height: 13, color: "#8FA89A", transform: "rotate(-90deg)", flexShrink: 0 }}>
        <Icon.Chevron />
      </span>
    </button>
  );
}

function ShapeGridBtn({ onClick, label, icon, color }: { onClick: () => void; label: string; icon: React.ReactNode; color: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl cursor-pointer hover:scale-105 active:scale-95 transition-all duration-150">
      <span className="flex items-center justify-center rounded-2xl" style={{ width: 44, height: 44, background: `${color}22`, color }}>
        <span style={{ width: 20, height: 20 }}>{icon}</span>
      </span>
      <span className="text-[11px] font-bold" style={{ color: "#7A9186" }}>
        {label}
      </span>
    </button>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
  nested = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  nested?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={nested ? "mt-1" : "px-4"}
      style={!nested ? { borderBottom: "1px solid var(--portal-line)" } : undefined}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between cursor-pointer"
        style={{ padding: nested ? "6px 0" : "10px 0" }}
      >
        <span className={nested ? "text-[11px] font-bold" : "text-[13px] font-bold"} style={{ color: nested ? "#7A9186" : "#2F4A3E" }}>
          {title}
        </span>
        <span
          style={{
            width: 13,
            height: 13,
            color: "#8FA89A",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 150ms",
          }}
        >
          <Icon.Chevron />
        </span>
      </button>
      {open && <div className={nested ? "pb-2 space-y-1.5 pl-1" : "pb-3 space-y-2"}>{children}</div>}
    </div>
  );
}

function PillGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-full px-2.5 py-2" style={{ background: "#fff", boxShadow: "0 3px 10px rgba(22,48,43,0.07)" }}>
      {children}
    </div>
  );
}

function LabeledGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <PillGroup>{children}</PillGroup>
      <span className="text-[10px] font-bold" style={{ color: "#8FA89A" }}>
        {label}
      </span>
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
      className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none hover:scale-110 active:scale-95 hover:shadow-md transition-all duration-150"
      style={{ color: "var(--portal-emerald)", background: "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#EAF5EE")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ width: 16, height: 16, display: "inline-block" }}>{children}</span>
    </button>
  );
}

function RailBtn({
  onClick,
  label,
  icon,
  color,
  active = false,
  title,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  color: string;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? `Add ${label}`}
      className="flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-2xl cursor-pointer hover:scale-110 active:scale-95 transition-all duration-150 group flex-shrink-0"
      style={{ background: active ? "#EAF2ED" : "transparent" }}
    >
      <span
        className="flex items-center justify-center rounded-2xl transition-shadow duration-150 group-hover:shadow-md"
        style={{ width: 40, height: 40, background: `${color}22`, color }}
      >
        <span style={{ width: 18, height: 18 }}>{icon}</span>
      </span>
      <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: active ? "var(--portal-emerald)" : "#7A9186" }}>
        {label}
      </span>
    </button>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 mb-1.5 mx-0.5 rounded-full cursor-pointer transition-all duration-150"
      style={{
        color: active ? "#fff" : "#4F6B5B",
        background: active ? "var(--portal-emerald)" : "transparent",
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
      className="flex-1 flex items-center justify-center py-2 rounded-lg cursor-pointer transition-all duration-150 hover:scale-105 active:scale-95"
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
      className="flex-1 text-xs font-bold py-2 rounded-full cursor-pointer capitalize transition-all duration-150 hover:scale-105 active:scale-95"
      style={{
        color: active ? "white" : "#5F7A6D",
        background: active ? "var(--portal-emerald)" : "#F0F4F1",
        boxShadow: active ? "0 3px 8px rgba(31,111,84,0.3)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] font-bold mb-2" style={{ color: "#2F4A3E" }}>
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

function BorderShadowOpacityControls({
  selected,
  updateSelected,
  bare = false,
}: {
  selected: any;
  updateSelected: (patch: any, commit?: boolean) => void;
  bare?: boolean;
}) {
  return (
    <div className="space-y-2">
      {!bare && <PanelLabel>Border &amp; shadow</PanelLabel>}
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
