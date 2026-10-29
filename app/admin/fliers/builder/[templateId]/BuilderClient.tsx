"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type Konva from "konva";
import { createClient } from "@/lib/supabase/client";
import {
  type FlierElement,
  type FlierImageElement,
  type FlierPage,
  type FontEntry,
  type TextEffect,
  BRAND_FONTS,
  FONT_LIBRARY,
  BRAND_COLORS,
  CANVAS_SIZE_PRESETS,
  PRINT_PRESETS,
  DEFAULT_TEXT_EFFECT,
  resizeElementsToCanvas,
  checkBrandConsistency,
  pagesFromTemplate,
  pagesToTemplateColumns,
  preflight,
  groupElements,
  ungroupElements,
  expandSelection,
  layerLabel,
  computeCoverCrop,
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
import { exportPagesAsImages, exportPagesAsPdf, downloadDataUrl, slug, waitForAssets, stageToDataUrl } from "@/lib/flierExport";
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
// Editor shell tokens (Flier Builder 2.0 mockup)
const SHELL_BG = "#EEF0EB";
const INK = "#16302B";
const LINE = "#DDE4DF";
const MUTED = "#5F6E68";

const PROGRAMS = ["Hunger Prevention", "Transitional Housing", "Disaster Response", "Refugee Services", "Fundraisers", "Volunteer events", "Ramadan / Eid", "Back to School", "Health Fair", "General"];
const LANGUAGES = ["English", "Spanish", "Arabic", "Urdu", "French", "Somali"];
const RTL_LANGUAGES = new Set(["Arabic", "Urdu"]);

type RailPanel = null | "text" | "elements" | "photos" | "edit" | "ai";
type AiTool = null | "erase" | "fill" | "expand" | "upscale" | "translate";

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

  // ---- Template metadata ----
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category ?? "");
  const [program, setProgram] = useState<string>(template.program ?? "");
  const [language, setLanguage] = useState<string>(template.language ?? "English");
  const [canvasWidth, setCanvasWidth] = useState<number>(template.canvas_width);
  const [canvasHeight, setCanvasHeight] = useState<number>(template.canvas_height);

  // ---- Pages ----
  const [pages, setPages] = useState<FlierPage[]>(() => pagesFromTemplate(template));
  const [pageIndex, setPageIndex] = useState(0);
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const elements = page.elements;
  const background = page.background;

  // ---- Selection ----
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds[0] ?? null;
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const selectedAll = useMemo(() => elements.filter((e) => selectedIds.includes(e.id)), [elements, selectedIds]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeRailPanel, setActiveRailPanel] = useState<RailPanel>(null);
  const [fontSearch, setFontSearch] = useState("");
  const [magicWriteOpen, setMagicWriteOpen] = useState(false);
  const [magicWritePrompt, setMagicWritePrompt] = useState("");
  const [magicWriteLoading, setMagicWriteLoading] = useState(false);
  const [magicWriteSuggestions, setMagicWriteSuggestions] = useState<string[] | null>(null);
  const [magicWriteError, setMagicWriteError] = useState<string | null>(null);
  const [effectsDrawer, setEffectsDrawer] = useState<null | "shape" | "crop" | "filter" | "adjust" | "blend" | "border" | "altText">(null);
  const [styleDrawer, setStyleDrawer] = useState<null | "font" | "color" | "fill" | "rectShape" | "textEffects">(null);
  const [zoom, setZoom] = useState(0.42);
  const [showSafeMargins, setShowSafeMargins] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [cropModeId, setCropModeId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [aiTool, setAiTool] = useState<AiTool>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const mainStageRef = useRef<Konva.Stage | null>(null);

  const fitZoom = useCallback(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const wide = el.clientWidth >= 768;
    const availW = el.clientWidth - (wide ? 140 : 48);
    const availH = el.clientHeight - 140;
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

  // ---- Undo/redo over the whole pages array ----
  const [history, setHistory] = useState<FlierPage[][]>([pages]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const commitPages = useCallback(
    (next: FlierPage[]) => {
      setPages(next);
      setHistory((h) => [...h.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
    },
    [historyIndex]
  );
  // Element-level commit for the current page (what FlierCanvas calls).
  const commit = useCallback(
    (nextElements: FlierElement[]) => {
      const next = pages.map((p, i) => (i === pageIndex ? { ...p, elements: nextElements } : p));
      commitPages(next);
    },
    [pages, pageIndex, commitPages]
  );
  const setElements = useCallback(
    (nextElements: FlierElement[]) => {
      setPages((ps) => ps.map((p, i) => (i === pageIndex ? { ...p, elements: nextElements } : p)));
    },
    [pageIndex]
  );
  function setBackground(bg: string) {
    commitPages(pages.map((p, i) => (i === pageIndex ? { ...p, background: bg } : p)));
  }

  function undo() {
    if (historyIndex === 0) return;
    setHistoryIndex((i) => i - 1);
    setPages(history[historyIndex - 1]);
  }
  function redo() {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex((i) => i + 1);
    setPages(history[historyIndex + 1]);
  }

  useEffect(() => {
    setPanelTab("style");
    setEffectsDrawer(null);
    setStyleDrawer(null);
    setRemoveBgError(null);
    setAltTextError(null);
    setAiError(null);
    setActiveRailPanel((p) => (p === "edit" && (!selected || selected.type !== "image") ? null : p));
    if (cropModeId && cropModeId !== selectedId) setCropModeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Selection helpers - group-aware: selecting one member selects the group.
  function selectMany(ids: string[], additive: boolean) {
    setSelectedIds((prev) => {
      const base = additive ? [...prev] : [];
      for (const id of ids) {
        const i = base.indexOf(id);
        if (additive && i >= 0) base.splice(i, 1);
        else base.push(id);
      }
      return expandSelection(elements, base);
    });
  }
  function selectOne(id: string | null) {
    setSelectedIds(id ? expandSelection(elements, [id]) : []);
  }

  function addElement(el: FlierElement) {
    commit([...elements, el]);
    setSelectedIds([el.id]);
  }
  function addPhoto(img: { dropbox_path: string | null; link: string }) {
    addElement(newImageElement({ dropboxPath: img.dropbox_path, imageUrl: img.link }));
  }
  function applyText(patch: { text?: string; fontFamily?: string }) {
    if (selected && selected.type === "text") updateSelected(patch as any);
    else addElement(newTextElement(patch));
  }
  async function runMagicWrite() {
    if (!magicWritePrompt.trim()) return;
    setMagicWriteLoading(true);
    setMagicWriteError(null);
    setMagicWriteSuggestions(null);
    try {
      const res = await fetch("/api/marketing/magic-write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: magicWritePrompt.trim() }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setMagicWriteSuggestions(body.suggestions);
    } catch (e: any) {
      setMagicWriteError(e.message);
    } finally {
      setMagicWriteLoading(false);
    }
  }
  function updateSelected(patch: Partial<FlierElement>, shouldCommit = true) {
    if (!selected) return;
    const next = elements.map((e) => (e.id === selected.id ? ({ ...e, ...patch } as FlierElement) : e));
    if (shouldCommit) commit(next);
    else setElements(next);
  }
  function updateAllSelected(patch: Partial<FlierElement>) {
    if (selectedIds.length === 0) return;
    commit(elements.map((e) => (selectedIds.includes(e.id) ? ({ ...e, ...patch } as FlierElement) : e)));
  }
  function deleteSelected() {
    if (selectedIds.length === 0) return;
    commit(elements.filter((e) => !selectedIds.includes(e.id)));
    setSelectedIds([]);
  }
  function duplicateSelected() {
    if (selectedAll.length === 0) return;
    const idMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    const copies = selectedAll.map((el) => {
      const id = crypto.randomUUID();
      idMap.set(el.id, id);
      let groupId = el.groupId;
      if (groupId) {
        if (!groupMap.has(groupId)) groupMap.set(groupId, crypto.randomUUID());
        groupId = groupMap.get(groupId);
      }
      return { ...el, id, groupId, x: el.x + 20, y: el.y + 20 } as FlierElement;
    });
    commit([...elements, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }
  function groupSelected() {
    if (selectedIds.length < 2) return;
    commit(groupElements(elements, selectedIds));
  }
  function ungroupSelected() {
    if (selectedIds.length === 0) return;
    commit(ungroupElements(elements, selectedIds));
  }
  const selectionIsGrouped = selectedAll.length > 1 && selectedAll.every((e) => e.groupId && e.groupId === selectedAll[0].groupId);
  function toggleLock(id?: string) {
    const ids = id ? [id] : selectedIds;
    if (ids.length === 0) return;
    const anyUnlocked = elements.some((e) => ids.includes(e.id) && !e.locked);
    commit(elements.map((e) => (ids.includes(e.id) ? ({ ...e, locked: anyUnlocked } as FlierElement) : e)));
    if (anyUnlocked) setSelectedIds([]);
  }
  function renameLayer(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const next = window.prompt("Layer name", el.name ?? layerLabel(el));
    if (next === null) return;
    commit(elements.map((e) => (e.id === id ? ({ ...e, name: next.trim() || undefined } as FlierElement) : e)));
  }

  const [smartResize, setSmartResize] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [brandCheckOpen, setBrandCheckOpen] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [removeBgError, setRemoveBgError] = useState<string | null>(null);
  const [altTextLoading, setAltTextLoading] = useState(false);
  const [altTextError, setAltTextError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [brushSize, setBrushSize] = useState(40);
  const [translateTo, setTranslateTo] = useState("Spanish");

  async function generateAltText() {
    if (!selected || selected.type !== "image" || !selected.imageUrl) return;
    setAltTextLoading(true);
    setAltTextError(null);
    try {
      const res = await fetch("/api/marketing/generate-alt-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: selected.imageUrl }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      updateSelected({ altText: body.altText } as any);
    } catch (e: any) {
      setAltTextError(e.message);
    } finally {
      setAltTextLoading(false);
    }
  }

  function resizeTo(newWidth: number, newHeight: number) {
    const next = pages.map((p) => ({ ...p, elements: resizeElementsToCanvas(p.elements, canvasWidth, canvasHeight, newWidth, newHeight) }));
    setCanvasWidth(newWidth);
    setCanvasHeight(newHeight);
    commitPages(next);
  }

  async function smartResizeTo(newWidth: number, newHeight: number) {
    setResizing(true);
    try {
      const simplified = elements.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, width: el.width, height: el.height, ...(el.type === "text" ? { text: el.text.slice(0, 80) } : {}) }));
      const res = await fetch("/api/marketing/smart-resize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ elements: simplified, oldWidth: canvasWidth, oldHeight: canvasHeight, newWidth, newHeight }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const layoutById = new Map<string, { x: number; y: number; width: number; height: number }>(body.layout.map((l: any) => [l.id, l]));
      const fallback = resizeElementsToCanvas(elements, canvasWidth, canvasHeight, newWidth, newHeight);
      const merged = elements.map((el, i) => {
        const l = layoutById.get(el.id);
        return l ? ({ ...el, x: l.x, y: l.y, width: l.width, height: l.height } as FlierElement) : fallback[i];
      });
      const next = pages.map((p, i) => (i === pageIndex ? { ...p, elements: merged } : { ...p, elements: resizeElementsToCanvas(p.elements, canvasWidth, canvasHeight, newWidth, newHeight) }));
      setCanvasWidth(newWidth);
      setCanvasHeight(newHeight);
      commitPages(next);
    } catch (e: any) {
      alert(`Smart resize failed, using regular resize instead: ${e.message}`);
      resizeTo(newWidth, newHeight);
    } finally {
      setResizing(false);
    }
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
    if (selectedAll.length === 0) return;
    // Multi-select aligns to the selection's bounding box; single aligns to the canvas.
    const box =
      selectedAll.length > 1
        ? {
            x: Math.min(...selectedAll.map((e) => e.x)),
            y: Math.min(...selectedAll.map((e) => e.y)),
            r: Math.max(...selectedAll.map((e) => e.x + e.width)),
            b: Math.max(...selectedAll.map((e) => e.y + e.height)),
          }
        : { x: 0, y: 0, r: canvasWidth, b: canvasHeight };
    commit(
      elements.map((e) => {
        if (!selectedIds.includes(e.id)) return e;
        const p: Partial<FlierElement> = {};
        if (pos === "left") p.x = box.x;
        if (pos === "hcenter") p.x = box.x + (box.r - box.x - e.width) / 2;
        if (pos === "right") p.x = box.r - e.width;
        if (pos === "top") p.y = box.y;
        if (pos === "vcenter") p.y = box.y + (box.b - box.y - e.height) / 2;
        if (pos === "bottom") p.y = box.b - e.height;
        return { ...e, ...p } as FlierElement;
      })
    );
  }

  // ---- Pages ----
  function addPage(duplicate = false) {
    const src = pages[pageIndex];
    const newPage: FlierPage = {
      id: crypto.randomUUID(),
      name: `Page ${pages.length + 1}`,
      background: src.background,
      elements: duplicate ? src.elements.map((e) => ({ ...e, id: crypto.randomUUID() })) : [],
    };
    const next = [...pages.slice(0, pageIndex + 1), newPage, ...pages.slice(pageIndex + 1)];
    commitPages(next);
    setPageIndex(pageIndex + 1);
    setSelectedIds([]);
  }
  function deletePage(i: number) {
    if (pages.length === 1) return;
    if (!confirm(`Delete ${pages[i].name}?`)) return;
    const next = pages.filter((_, j) => j !== i);
    commitPages(next);
    setPageIndex(Math.max(0, Math.min(pageIndex, next.length - 1)));
    setSelectedIds([]);
  }
  function movePage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    const next = [...pages];
    [next[i], next[j]] = [next[j], next[i]];
    commitPages(next);
    setPageIndex(j);
  }

  // ---- Keyboard ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        setCropModeId(null);
        setAiTool(null);
        setSelectedIds([]);
      } else if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (mod && e.key === "g" && e.shiftKey) {
        e.preventDefault();
        ungroupSelected();
      } else if (mod && e.key === "g") {
        e.preventDefault();
        groupSelected();
      } else if (mod && e.key === "l") {
        e.preventDefault();
        toggleLock();
      } else if (mod && e.key === "a") {
        e.preventDefault();
        setSelectedIds(elements.filter((el) => !el.locked).map((el) => el.id));
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        deleteSelected();
      } else if (selectedIds.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setElements(elements.map((el) => (selectedIds.includes(el.id) ? ({ ...el, x: el.x + dx, y: el.y + dy } as FlierElement) : el)));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selected, elements, pages, historyIndex, history]);

  // ---- Save ----
  async function save() {
    setSaving(true);
    const allEditable = pages.flatMap((p) => p.elements.filter((e) => e.editable).map((e) => ({ id: e.id, type: e.type, label: (e as any).editableLabel ?? "Untitled field" })));
    const cols = pagesToTemplateColumns(pages);
    await supabase
      .from("flier_templates")
      .update({
        name,
        category: category || null,
        program: program || null,
        language,
        format_label: CANVAS_SIZE_PRESETS.find((p) => p.width === canvasWidth && p.height === canvasHeight)?.label ?? `${canvasWidth}×${canvasHeight}`,
        canvas_width: canvasWidth,
        canvas_height: canvasHeight,
        ...cols,
        editable_element_ids: allEditable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);
    // Thumbnail from the live stage (page 1 only, when it's showing).
    try {
      if (pageIndex === 0 && mainStageRef.current) {
        const dataUrl = stageToDataUrl(mainStageRef.current, 0.4, "image/png");
        fetch("/api/marketing/fliers/thumbnail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: template.id, dataUrl }) }).catch(() => null);
      }
    } catch {}
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ---- AI Studio actions ----
  async function runRemoveBackground() {
    if (!selected || selected.type !== "image" || !selected.imageUrl) return;
    setRemovingBg(true);
    setRemoveBgError(null);
    try {
      const res = await fetch("/api/marketing/remove-background", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: selected.imageUrl }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      updateSelected({ imageUrl: body.dataUri, dropboxPath: null, naturalWidth: undefined, naturalHeight: undefined } as any);
    } catch (e: any) {
      setRemoveBgError(e.message);
    } finally {
      setRemovingBg(false);
    }
  }
  async function runUpscale(factor: 2 | 4) {
    if (!selected || selected.type !== "image" || !selected.imageUrl) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/marketing/upscale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: selected.imageUrl, factor }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      updateSelected({ imageUrl: body.dataUri, dropboxPath: null, naturalWidth: body.width, naturalHeight: body.height } as any);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  }
  async function runExpandToFrame() {
    if (!selected || selected.type !== "image" || !selected.imageUrl || !selected.naturalWidth || !selected.naturalHeight) return;
    const sw = selected.naturalWidth;
    const sh = selected.naturalHeight;
    const target = selected.width / selected.height;
    const srcAspect = sw / sh;
    let expand = { top: 0, right: 0, bottom: 0, left: 0 };
    if (Math.abs(srcAspect - target) < 0.02) {
      setAiError("This photo already matches its frame's shape.");
      return;
    }
    if (srcAspect > target) {
      const newH = Math.round(sw / target);
      const d = newH - sh;
      expand = { top: Math.floor(d / 2), bottom: Math.ceil(d / 2), left: 0, right: 0 };
    } else {
      const newW = Math.round(sh * target);
      const d = newW - sw;
      expand = { left: Math.floor(d / 2), right: Math.ceil(d / 2), top: 0, bottom: 0 };
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/marketing/image-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: selected.imageUrl, mode: "expand", prompt: aiPrompt, expand }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      updateSelected({ imageUrl: body.dataUri, dropboxPath: null, naturalWidth: body.width, naturalHeight: body.height, cropZoom: 1, cropOffsetX: 0, cropOffsetY: 0 } as any);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  }
  // Mask painting for erase/fill lives in <MaskPainter>; it hands back an
  // RGBA PNG in SOURCE pixel space (alpha 0 where painted).
  async function runMaskedEdit(maskDataUrl: string) {
    if (!selected || selected.type !== "image" || !selected.imageUrl || !aiTool) return;
    const mode = aiTool === "erase" ? "erase" : "fill";
    if (mode === "fill" && !aiPrompt.trim()) {
      setAiError("Describe what to paint into the selected area.");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/marketing/image-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: selected.imageUrl, mask: maskDataUrl, mode, prompt: aiPrompt }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      updateSelected({ imageUrl: body.dataUri, dropboxPath: null, naturalWidth: body.width, naturalHeight: body.height } as any);
      setAiTool(null);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  }
  async function runTranslate(scope: "page" | "all") {
    const targets = scope === "page" ? [pageIndex] : pages.map((_, i) => i);
    const items = targets.flatMap((pi) => pages[pi].elements.filter((e) => e.type === "text" && e.text.trim()).map((e) => ({ id: e.id, text: (e as any).text as string })));
    if (items.length === 0) {
      setAiError("No text to translate.");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/marketing/translate-flier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, language: translateTo }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const tr = body.translations as Record<string, string>;
      const rtl = RTL_LANGUAGES.has(translateTo);
      const next = pages.map((p, i) =>
        !targets.includes(i)
          ? p
          : {
              ...p,
              elements: p.elements.map((e) =>
                e.type === "text" && tr[e.id]
                  ? ({ ...e, text: tr[e.id], align: rtl && e.align === "left" ? "right" : !rtl && e.align === "right" && RTL_LANGUAGES.has(language) ? "left" : e.align } as FlierElement)
                  : e
              ),
            }
      );
      commitPages(next);
      setLanguage(translateTo);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  }

  const hasEffectsTab = !!selected && selected.type !== "line" && selected.type !== "image";

  // ---- Image edit panel ----
  const imageEditCategories = selected && selected.type === "image" && (
    <div className="space-y-2">
      <button
        onClick={() => setCropModeId(cropModeId === selected.id ? null : selected.id)}
        className="w-full flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-bold cursor-pointer text-white disabled:opacity-50"
        style={{ background: cropModeId === selected.id ? "#16302B" : "var(--portal-emerald)" }}
        disabled={!selected.imageUrl}
      >
        {cropModeId === selected.id ? "Done cropping" : "Crop & reposition"}
      </button>
      {cropModeId === selected.id && (
        <p className="text-[11px]" style={{ color: DIM }}>
          Drag the photo inside its frame · scroll to zoom · Esc to finish.
        </p>
      )}
      <button
        onClick={runRemoveBackground}
        disabled={removingBg || !selected.imageUrl}
        className="w-full flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-bold cursor-pointer text-white disabled:opacity-50"
        style={{ background: "#8A5FB5" }}
        title={!selected.imageUrl ? "Choose a photo first" : undefined}
      >
        ✨ {removingBg ? "Removing background…" : "Remove background"}
      </button>
      {removeBgError && <p className="text-xs text-red-600">{removeBgError}</p>}
      <CategoryButton label="Shape" onClick={() => setEffectsDrawer("shape")} />
      <CategoryButton label="Crop sliders" onClick={() => setEffectsDrawer("crop")} />
      <CategoryButton label="Filter" onClick={() => setEffectsDrawer("filter")} />
      <CategoryButton label="Adjust" onClick={() => setEffectsDrawer("adjust")} />
      <CategoryButton label="Blend & overlay" onClick={() => setEffectsDrawer("blend")} />
      <CategoryButton label="Border & shadow" onClick={() => setEffectsDrawer("border")} />
      <CategoryButton label="Alt text" onClick={() => setEffectsDrawer("altText")} />
      <div className="flex gap-1.5 pt-1">
        <SegBtn active={!!selected.flipX} onClick={() => updateSelected({ flipX: !selected.flipX } as any)}>
          Flip H
        </SegBtn>
        <SegBtn active={!!selected.flipY} onClick={() => updateSelected({ flipY: !selected.flipY } as any)}>
          Flip V
        </SegBtn>
      </div>
    </div>
  );

  const imageEditContent: Record<NonNullable<typeof effectsDrawer>, { title: string; body: React.ReactNode }> | null =
    selected && selected.type === "image"
      ? {
          shape: {
            title: "Shape",
            body: (
              <>
                <div className="flex gap-1.5">
                  {(["rect", "rounded", "circle"] as const).map((m) => (
                    <SegBtn key={m} active={selected.maskShape === m} onClick={() => updateSelected({ maskShape: m })}>
                      {m}
                    </SegBtn>
                  ))}
                </div>
                {selected.maskShape === "rounded" && (
                  <SliderRow label="Radius" min={0} max={Math.min(selected.width, selected.height) / 2} step={1} value={selected.maskCornerRadius} onChange={(v) => updateSelected({ maskCornerRadius: v }, false)} onCommit={(v) => updateSelected({ maskCornerRadius: v })} />
                )}
              </>
            ),
          },
          crop: {
            title: "Crop sliders",
            body: (
              <>
                <SliderRow label="Zoom" min={1} max={4} step={0.05} value={selected.cropZoom} onChange={(v) => updateSelected({ cropZoom: v }, false)} onCommit={(v) => updateSelected({ cropZoom: v })} />
                <SliderRow label="Pan X" min={-1} max={1} step={0.05} value={selected.cropOffsetX} onChange={(v) => updateSelected({ cropOffsetX: v }, false)} onCommit={(v) => updateSelected({ cropOffsetX: v })} />
                <SliderRow label="Pan Y" min={-1} max={1} step={0.05} value={selected.cropOffsetY} onChange={(v) => updateSelected({ cropOffsetY: v }, false)} onCommit={(v) => updateSelected({ cropOffsetY: v })} />
                <button onClick={() => updateSelected({ cropZoom: 1, cropOffsetX: 0, cropOffsetY: 0 })} className="text-xs underline" style={{ color: DIM }}>
                  Reset
                </button>
              </>
            ),
          },
          filter: {
            title: "Filter",
            body: (
              <>
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
                    <input type="color" value={selected.duotoneShadow} onChange={(e) => updateSelected({ duotoneShadow: e.target.value })} className="w-6 h-6 rounded-full cursor-pointer" />
                    <input type="color" value={selected.duotoneHighlight} onChange={(e) => updateSelected({ duotoneHighlight: e.target.value })} className="w-6 h-6 rounded-full cursor-pointer" />
                  </div>
                )}
              </>
            ),
          },
          adjust: {
            title: "Adjust",
            body: (
              <>
                <SliderRow label="Bright." min={-1} max={1} step={0.05} value={selected.brightness} onChange={(v) => updateSelected({ brightness: v }, false)} onCommit={(v) => updateSelected({ brightness: v })} />
                <SliderRow label="Contrast" min={-50} max={50} step={1} value={selected.contrast} onChange={(v) => updateSelected({ contrast: v }, false)} onCommit={(v) => updateSelected({ contrast: v })} />
                <SliderRow label="Saturate" min={-2} max={2} step={0.1} value={selected.saturation} onChange={(v) => updateSelected({ saturation: v }, false)} onCommit={(v) => updateSelected({ saturation: v })} />
                <SliderRow label="Warmth" min={-50} max={50} step={1} value={selected.warmth ?? 0} onChange={(v) => updateSelected({ warmth: v } as any, false)} onCommit={(v) => updateSelected({ warmth: v } as any)} />
                <SliderRow label="Hue" min={0} max={360} step={5} value={selected.hue} onChange={(v) => updateSelected({ hue: v }, false)} onCommit={(v) => updateSelected({ hue: v })} />
                <SliderRow label="Blur" min={0} max={15} step={0.5} value={selected.blur} onChange={(v) => updateSelected({ blur: v }, false)} onCommit={(v) => updateSelected({ blur: v })} />
                <SliderRow label="Vignette" min={0} max={100} step={1} value={selected.vignette ?? 0} onChange={(v) => updateSelected({ vignette: v } as any, false)} onCommit={(v) => updateSelected({ vignette: v } as any)} />
                <button onClick={() => updateSelected({ brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: 0, blur: 0, vignette: 0 } as any)} className="text-xs underline" style={{ color: DIM }}>
                  Reset adjustments
                </button>
              </>
            ),
          },
          blend: {
            title: "Blend & overlay",
            body: (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
                    Blend
                  </span>
                  <select value={selected.blendMode ?? "normal"} onChange={(e) => updateSelected({ blendMode: e.target.value } as any)} className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={{ border: "1px solid var(--portal-line)" }}>
                    {["normal", "multiply", "screen", "overlay", "darken", "lighten", "soft-light"].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
                    Overlay
                  </span>
                  <input type="color" value={selected.overlayColor ?? "#1F6F54"} onChange={(e) => updateSelected({ overlayColor: e.target.value } as any)} className="w-6 h-6 rounded-full cursor-pointer" />
                  <ColorSwatchRow value={selected.overlayColor ?? "#1F6F54"} onChange={(c) => updateSelected({ overlayColor: c } as any)} compact />
                </div>
                <SliderRow label="Overlay %" min={0} max={1} step={0.05} value={selected.overlayOpacity ?? 0} onChange={(v) => updateSelected({ overlayOpacity: v } as any, false)} onCommit={(v) => updateSelected({ overlayOpacity: v } as any)} />
              </div>
            ),
          },
          border: { title: "Border & shadow", body: <BorderShadowOpacityControls selected={selected} updateSelected={updateSelected} bare /> },
          altText: {
            title: "Alt text",
            body: (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: DIM }}>
                  Describes the image for accessibility and social posting.
                </p>
                <textarea value={selected.altText ?? ""} onChange={(e) => updateSelected({ altText: e.target.value } as any, false)} onBlur={(e) => updateSelected({ altText: e.target.value } as any)} rows={3} placeholder="e.g. Volunteers packing food boxes at a distribution event" className="w-full rounded-lg px-2.5 py-2 text-sm" style={{ border: "1px solid var(--portal-line)" }} />
                <button onClick={generateAltText} disabled={altTextLoading || !selected.imageUrl} className="text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer disabled:opacity-50" style={{ border: "1px solid var(--portal-emerald)", color: "var(--portal-emerald)" }}>
                  ✨ {altTextLoading ? "Looking at the image…" : "Generate with AI"}
                </button>
                {altTextError && <p className="text-xs text-red-600">{altTextError}</p>}
              </div>
            ),
          },
        }
      : null;

  const editImagePanel = (
    <>
      <div className="flex items-center justify-between mb-3">
        {effectsDrawer && imageEditContent ? (
          <button onClick={() => setEffectsDrawer(null)} className="flex items-center gap-1.5 text-sm font-bold cursor-pointer" style={{ color: "#2F4A3E" }}>
            <span style={{ width: 13, height: 13, transform: "rotate(90deg)" }}>
              <Icon.Chevron />
            </span>
            {imageEditContent[effectsDrawer].title}
          </button>
        ) : (
          <h3 className="text-sm font-bold">Edit image</h3>
        )}
        <button
          onClick={() => {
            setActiveRailPanel(null);
            setEffectsDrawer(null);
            setCropModeId(null);
          }}
          className="text-sm cursor-pointer"
          style={{ color: DIM }}
        >
          ✕
        </button>
      </div>
      {effectsDrawer && imageEditContent ? imageEditContent[effectsDrawer].body : imageEditCategories}
    </>
  );

  // ---- AI Studio panel ----
  const selectedImage = selected && selected.type === "image" && selected.imageUrl ? (selected as FlierImageElement) : null;
  const aiStudioPanel = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <span style={{ color: "var(--portal-gold)" }}>✦</span> AI Studio
        </h3>
        <button
          onClick={() => {
            setActiveRailPanel(null);
            setAiTool(null);
          }}
          className="text-sm cursor-pointer"
          style={{ color: DIM }}
        >
          ✕
        </button>
      </div>
      {aiError && <p className="text-xs text-red-600 mb-2">{aiError}</p>}
      {!aiTool && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "#7A9186" }}>
              Photo tools {selectedImage ? "" : "· select a photo first"}
            </p>
            <div className="space-y-1.5">
              <AiToolRow title="Crop & frame" desc="Drag the photo inside its frame" disabled={!selectedImage} onClick={() => setCropModeId(selectedImage!.id)} />
              <AiToolRow title="Remove background" desc="One tap · remove.bg" disabled={!selectedImage || removingBg} onClick={runRemoveBackground} />
              <AiToolRow title="Magic erase" desc="Brush over clutter, people, logos" disabled={!selectedImage} onClick={() => setAiTool("erase")} />
              <AiToolRow title="Generative fill" desc="Brush an area and describe what goes there" disabled={!selectedImage} onClick={() => setAiTool("fill")} />
              <AiToolRow title="Generative expand" desc="Extend the photo to fit its frame" disabled={!selectedImage} onClick={() => setAiTool("expand")} />
              <AiToolRow title="Upscale 2× / 4×" desc="Fix low-res photos before print" disabled={!selectedImage} onClick={() => setAiTool("upscale")} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "#7A9186" }}>
              Design tools
            </p>
            <div className="space-y-1.5">
              <AiToolRow title="Magic Write" desc="Brand-voice copy for a text box" onClick={() => { setActiveRailPanel("text"); setMagicWriteOpen(true); }} />
              <AiToolRow title="Translate flier" desc="Spanish, Arabic, Urdu… keeps layout" onClick={() => setAiTool("translate")} />
              <AiToolRow title="Smart Resize" desc="Reflow to another size with AI" onClick={() => setSmartResize(true)} />
            </div>
          </div>
        </div>
      )}
      {(aiTool === "erase" || aiTool === "fill") && selectedImage && (
        <div className="space-y-3">
          <button onClick={() => setAiTool(null)} className="text-xs font-bold" style={{ color: "#2F4A3E" }}>
            ← Back
          </button>
          <p className="text-xs" style={{ color: DIM }}>
            {aiTool === "erase" ? "Paint over what you want removed, then Apply." : "Paint where the new content should go, describe it, then Apply."}
          </p>
          <SliderRow label="Brush" min={8} max={160} step={2} value={brushSize} onChange={setBrushSize} onCommit={setBrushSize} />
          {aiTool === "fill" && (
            <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g. a stack of winter coats on a table" className="w-full rounded-lg px-2.5 py-2 text-xs" style={{ border: "1px solid var(--portal-line)" }} />
          )}
          <p className="text-[11px]" style={{ color: DIM }}>
            {aiBusy ? "Working… this takes 10–30 seconds." : "Use the Apply / Clear buttons on the photo."}
          </p>
        </div>
      )}
      {aiTool === "expand" && selectedImage && (
        <div className="space-y-3">
          <button onClick={() => setAiTool(null)} className="text-xs font-bold" style={{ color: "#2F4A3E" }}>
            ← Back
          </button>
          <p className="text-xs" style={{ color: DIM }}>
            Extends the photo so it fills its frame ({Math.round(selectedImage.width)}×{Math.round(selectedImage.height)}) with no crop — useful when a square photo has to become a Story.
          </p>
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Optional: what's in the surroundings" className="w-full rounded-lg px-2.5 py-2 text-xs" style={{ border: "1px solid var(--portal-line)" }} />
          <button onClick={runExpandToFrame} disabled={aiBusy} className="w-full rounded-full px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--portal-emerald)" }}>
            {aiBusy ? "Expanding…" : "Expand to frame"}
          </button>
        </div>
      )}
      {aiTool === "upscale" && selectedImage && (
        <div className="space-y-3">
          <button onClick={() => setAiTool(null)} className="text-xs font-bold" style={{ color: "#2F4A3E" }}>
            ← Back
          </button>
          <p className="text-xs" style={{ color: DIM }}>
            Current: {selectedImage.naturalWidth ?? "?"} × {selectedImage.naturalHeight ?? "?"} px. Lanczos resampling + sharpening — clean enlargement for print, won't invent detail.
          </p>
          <div className="flex gap-2">
            <button onClick={() => runUpscale(2)} disabled={aiBusy} className="flex-1 rounded-full px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--portal-emerald)" }}>
              2×
            </button>
            <button onClick={() => runUpscale(4)} disabled={aiBusy} className="flex-1 rounded-full px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#16302B" }}>
              4×
            </button>
          </div>
          {aiBusy && <p className="text-[11px]" style={{ color: DIM }}>Upscaling…</p>}
        </div>
      )}
      {aiTool === "translate" && (
        <div className="space-y-3">
          <button onClick={() => setAiTool(null)} className="text-xs font-bold" style={{ color: "#2F4A3E" }}>
            ← Back
          </button>
          <select value={translateTo} onChange={(e) => setTranslateTo(e.target.value)} className="w-full rounded-lg px-2.5 py-2 text-sm" style={{ border: "1px solid var(--portal-line)" }}>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <p className="text-xs" style={{ color: DIM }}>
            Names, addresses, phone numbers and dates stay as-is. Tip: duplicate the page first to keep the {language} version.
          </p>
          <div className="flex gap-2">
            <button onClick={() => runTranslate("page")} disabled={aiBusy} className="flex-1 rounded-full px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--portal-emerald)" }}>
              {aiBusy ? "Translating…" : "This page"}
            </button>
            {pages.length > 1 && (
              <button onClick={() => runTranslate("all")} disabled={aiBusy} className="flex-1 rounded-full px-3 py-2.5 text-sm font-bold disabled:opacity-50" style={{ border: "1.5px solid var(--portal-emerald)", color: "var(--portal-emerald)" }}>
                All pages
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );

  // ---- Text panel ----
  const filteredFontLibrary = FONT_LIBRARY.filter((f) => f.family.toLowerCase().includes(fontSearch.trim().toLowerCase()));
  const fontCategories: FontEntry["category"][] = ["Brand", "Script", "Display", "Serif", "Sans"];
  const textPanelContent = (
    <div className="space-y-4">
      <input value={fontSearch} onChange={(e) => setFontSearch(e.target.value)} placeholder="Search fonts…" className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--portal-line)" }} />
      <button onClick={() => addElement(newTextElement())} className="w-full flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-bold cursor-pointer text-white" style={{ background: "var(--portal-emerald)" }}>
        <span style={{ width: 14, height: 14 }}>
          <Icon.TextTool />
        </span>
        Add a text box
      </button>
      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={() => addElement(newTextElement({ text: "Headline", fontFamily: "Fraunces", fontStyle: "italic", fontSize: 72, width: 600, height: 90 }))} className="rounded-xl py-2 text-sm font-bold" style={{ border: "1px solid var(--portal-line)", fontFamily: "Fraunces", fontStyle: "italic" }}>
          Headline
        </button>
        <button onClick={() => addElement(newTextElement({ text: "Subheading", fontStyle: "bold", fontSize: 36, width: 500, height: 50 }))} className="rounded-xl py-2 text-sm font-bold" style={{ border: "1px solid var(--portal-line)" }}>
          Subhead
        </button>
        <button onClick={() => addElement(newTextElement({ text: "Body text goes here.", fontSize: 24, width: 500, height: 80 }))} className="rounded-xl py-2 text-xs" style={{ border: "1px solid var(--portal-line)" }}>
          Body
        </button>
      </div>

      <div className="rounded-xl" style={{ border: "1px solid var(--portal-line)" }}>
        <button onClick={() => setMagicWriteOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer">
          <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "#2F4A3E" }}>
            <span style={{ width: 14, height: 14 }}>
              <Icon.Effects />
            </span>
            Magic Write
          </span>
          <span style={{ width: 13, height: 13, color: "#8FA89A", transform: magicWriteOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
            <Icon.Chevron />
          </span>
        </button>
        {magicWriteOpen && (
          <div className="px-3 pb-3 space-y-2">
            <p className="text-xs" style={{ color: DIM }}>
              Describe what the flyer's for and get short copy suggestions.
            </p>
            <div className="flex gap-1.5">
              <input value={magicWritePrompt} onChange={(e) => setMagicWritePrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runMagicWrite()} placeholder="e.g. blood drive next Saturday" className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-xs" style={{ border: "1px solid var(--portal-line)" }} />
              <button onClick={runMagicWrite} disabled={magicWriteLoading || !magicWritePrompt.trim()} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium cursor-pointer flex-shrink-0 disabled:opacity-50" style={{ background: "var(--portal-emerald)" }}>
                {magicWriteLoading ? "…" : "Generate"}
              </button>
            </div>
            {magicWriteError && <p className="text-xs text-red-600">{magicWriteError}</p>}
            {magicWriteSuggestions && (
              <div className="space-y-1.5">
                {magicWriteSuggestions.map((s, i) => (
                  <button key={i} onClick={() => applyText({ text: s })} className="w-full text-left text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-black/[0.03] transition-colors" style={{ border: "1px solid var(--portal-line)", color: "#2F4A3E" }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {fontCategories.map((cat) => {
        const inCat = filteredFontLibrary.filter((f) => f.category === cat);
        if (inCat.length === 0) return null;
        return (
          <div key={cat}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "#7A9186" }}>
              {cat}
            </p>
            <div className="space-y-1">
              {inCat.map((f) => (
                <button key={f.family} onClick={() => applyText({ fontFamily: f.family })} className="w-full text-left px-3 py-2.5 rounded-lg cursor-pointer hover:bg-black/[0.03] transition-colors" style={{ border: "1px solid var(--portal-line)", fontFamily: f.family, fontSize: 17, color: "#16302B" }}>
                  {f.family}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {filteredFontLibrary.length === 0 && (
        <p className="text-xs" style={{ color: DIM }}>
          No fonts match "{fontSearch}".
        </p>
      )}
    </div>
  );

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
          Photo frames · drop a photo in
        </p>
        <div className="grid grid-cols-3 gap-1">
          <ShapeGridBtn label="Circle" icon={ICONS.circle} color="#B5566B" onClick={() => addElement(newImageElement({ maskShape: "circle", name: "Photo frame" }))} />
          <ShapeGridBtn label="Rounded" icon={ICONS.rect} color="#B5566B" onClick={() => addElement(newImageElement({ maskShape: "rounded", maskCornerRadius: 40, name: "Photo frame" }))} />
          <ShapeGridBtn label="Wide" icon={ICONS.image} color="#B5566B" onClick={() => addElement(newImageElement({ width: 520, height: 300, name: "Photo frame" }))} />
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "#7A9186" }}>
          Graphics
        </p>
        <div className="grid grid-cols-5 gap-2">
          {ICON_LIBRARY.map((def) => (
            <button key={def.id} onClick={() => addElement(newIconElement(def.id))} title={def.label} className="aspect-square rounded-lg flex items-center justify-center cursor-pointer hover:bg-black/[0.04] transition-colors" style={{ border: "1px solid var(--portal-line)" }}>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d={def.path} fill={def.mode === "filled" ? "#16302B" : "none"} stroke={def.mode === "stroke" ? "#16302B" : "none"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const issues = useMemo(() => preflight(pages, canvasWidth, canvasHeight), [pages, canvasWidth, canvasHeight]);

  const [ctxMenu, setCtxMenu] = useState<null | "align" | "layer">(null);
  useEffect(() => setCtxMenu(null), [selectedIds]);
  const selectedText = selected && selected.type === "text" && selectedIds.length === 1 ? selected : null;
  const selectedImg = selected && selected.type === "image" && selectedIds.length === 1 ? selected : null;
  const sizePreset = CANVAS_SIZE_PRESETS.find((p) => p.width === canvasWidth && p.height === canvasHeight);
  const RAIL: { id: Exclude<RailPanel, null | "edit">; label: string; icon: React.ReactNode; gold?: boolean }[] = [
    { id: "text", label: "Text", icon: ICONS.text },
    { id: "photos", label: "Photos", icon: ICONS.image },
    { id: "elements", label: "Elements", icon: ICONS.rect },
    { id: "ai", label: "AI Studio", icon: <Icon.Effects />, gold: true },
  ];
  const railButtons = (
    <>
      <RailBtn onClick={() => setActiveRailPanel((p) => (p === "text" ? null : "text"))} label="Text" icon={ICONS.text} color="#3E7FBF" active={activeRailPanel === "text"} title="Add or style text" />
      <RailBtn onClick={() => setActiveRailPanel((p) => (p === "photos" ? null : "photos"))} label="Photos" icon={ICONS.image} color="#B5566B" active={activeRailPanel === "photos"} title="Browse photos" />
      <RailBtn onClick={() => setActiveRailPanel((p) => (p === "elements" ? null : "elements"))} label="Elements" icon={ICONS.rect} color="#E2892F" active={activeRailPanel === "elements"} title="Browse shapes & icons" />
      <RailBtn onClick={() => setActiveRailPanel((p) => (p === "ai" ? null : "ai"))} label="AI Studio" icon={<Icon.Effects />} color="#C99A3D" active={activeRailPanel === "ai"} title="AI photo & design tools" />
    </>
  );
  const panelTitle = activeRailPanel === "text" ? "Text" : activeRailPanel === "elements" ? "Elements" : null;
  const panelBody =
    activeRailPanel === "text" ? textPanelContent : activeRailPanel === "elements" ? elementsPanelContent : activeRailPanel === "edit" ? editImagePanel : activeRailPanel === "ai" ? aiStudioPanel : <ApprovedImagePicker docked allowMore onClose={() => setActiveRailPanel(null)} onSelect={addPhoto} />;

  return (
    <div className="flex flex-col lg:fixed lg:inset-0 lg:z-40 mt-2 lg:mt-0 rounded-2xl lg:rounded-none overflow-hidden lg:overflow-visible" style={{ background: SHELL_BG, color: INK }}>
      {/* ---------- Top bar ---------- */}
      <header className="flex items-center gap-3 px-3 sm:px-4 py-2 lg:py-0 flex-shrink-0 flex-wrap lg:flex-nowrap" style={{ minHeight: 56, background: "#fff", borderBottom: `1px solid ${LINE}` }}>
        <Link href="/admin/fliers/builder" className="flex items-center gap-2.5 flex-shrink-0" title="Back to all templates">
          <span className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: "#1F6F54" }}>
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
            </svg>
          </span>
          <span className="hidden sm:inline text-sm font-bold">Flier Builder</span>
        </Link>
        <span className="hidden sm:inline text-xs" style={{ color: MUTED }}>/</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Template name"
          className="text-sm font-semibold outline-none rounded-lg px-2 py-1.5 min-w-0 w-44 lg:w-56 hover:bg-black/[0.03] focus:bg-black/[0.03]"
          style={{ color: MUTED }}
        />
        <div className="flex items-center gap-0.5">
          <FlatIconBtn onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)"><Icon.Undo /></FlatIconBtn>
          <FlatIconBtn onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"><Icon.Redo /></FlatIconBtn>
        </div>
        {(saving || saved) && (
          <span className="hidden md:flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: saving ? "#C99A3D" : "#1F6F54", display: "inline-block" }} />
            {saving ? "Saving…" : "Saved"}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setBrandCheckOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
          style={issues.length ? { background: "#FCE5E0", color: "#B55139" } : { background: "#E8F4EE", color: "#1F6F54" }}
          title="Brand + preflight check"
        >
          {issues.length ? `⚠ ${issues.length} brand check${issues.length > 1 ? "s" : ""}` : "✓ Brand check passed"}
        </button>
        <button onClick={save} disabled={saving} className="h-[34px] px-3.5 rounded-full text-xs font-semibold disabled:opacity-60" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
          {saving ? "Saving…" : "Save template"}
        </button>
        <button onClick={() => setExportOpen(true)} className="h-[34px] px-4 rounded-full text-xs font-bold text-white inline-flex items-center gap-1.5" style={{ background: "#1F6F54" }}>
          Export
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v12M6 10l6 6 6-6" />
          </svg>
        </button>
      </header>

      <Drawer title="Brand & preflight check" open={brandCheckOpen} onClose={() => setBrandCheckOpen(false)}>
        {issues.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--portal-emerald)" }}>
            ✓ Every font and color is from the brand kit, every photo frame is filled, and nothing sits in the trim margin.
          </p>
        ) : (
          <div className="space-y-1.5">
            {issues.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  if (it.elementId) {
                    const pi = pages.findIndex((p) => p.elements.some((e) => e.id === it.elementId));
                    if (pi >= 0) setPageIndex(pi);
                    setSelectedIds([it.elementId]);
                    setBrandCheckOpen(false);
                  }
                }}
                className="w-full text-left text-xs px-3 py-2 rounded-lg flex gap-2 items-start"
                style={{ background: it.level === "error" ? "#FCE5E0" : "#FCEFDD", cursor: it.elementId ? "pointer" : "default" }}
              >
                <span>{it.level === "error" ? "⛔" : "⚠"}</span>
                <span>{it.message}</span>
              </button>
            ))}
            <p className="text-[11px] mt-2" style={{ color: DIM }}>
              Brand fonts: {BRAND_FONTS.join(", ")} · Brand colors: {BRAND_COLORS.join(", ")}
            </p>
          </div>
        )}
      </Drawer>

      {exportOpen && (
        <ExportSheet
          pages={pages}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          templateName={name}
          templateId={template.id}
          issues={issues}
          onClose={() => setExportOpen(false)}
          onFixIssue={(elementId) => {
            const pi = pages.findIndex((p) => p.elements.some((e) => e.id === elementId));
            if (pi >= 0) setPageIndex(pi);
            setSelectedIds([elementId]);
            setExportOpen(false);
          }}
        />
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* ---------- Left rail ---------- */}
        <nav className="hidden lg:flex flex-col items-center gap-0.5 pt-2.5 flex-shrink-0" style={{ width: 68, background: INK }} aria-label="Builder tools">
          {RAIL.map((r) => {
            const active = activeRailPanel === r.id || (r.id === "photos" && activeRailPanel === "edit");
            return (
              <button
                key={r.id}
                onClick={() => setActiveRailPanel((p) => (p === r.id ? null : r.id))}
                className="flex flex-col items-center justify-center gap-[5px] rounded-[10px] text-[10px] transition-colors"
                style={{ width: 58, height: 54, background: active ? "rgba(255,255,255,0.12)" : "transparent", color: r.gold ? "#E8CE96" : active ? "#fff" : "#C9D6D0", fontWeight: active || r.gold ? 700 : 600 }}
                aria-pressed={active}
              >
                <span style={{ width: 18, height: 18, display: "inline-block" }}>{r.icon}</span>
                {r.label}
              </button>
            );
          })}
        </nav>

        {/* ---------- Docked panel ---------- */}
        {activeRailPanel && (
          <aside className="hidden lg:flex flex-col flex-shrink-0 overflow-y-auto p-4" style={{ width: 300, background: "#fff", borderRight: `1px solid ${LINE}` }}>
            {panelTitle && (
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold">{panelTitle}</h3>
                <button onClick={() => setActiveRailPanel(null)} className="text-sm cursor-pointer" style={{ color: DIM }} aria-label="Close panel">
                  ✕
                </button>
              </div>
            )}
            {panelBody}
          </aside>
        )}

        {/* ---------- Canvas column ---------- */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Context toolbar: what you can do with the selection (or the page) */}
          <div className="flex items-center gap-2 px-3 overflow-x-auto flex-shrink-0 text-xs" style={{ height: 48, background: "#fff", borderBottom: `1px solid ${LINE}` }}>
            {selected ? (
              <>
                {selectedText && (
                  <>
                    <select
                      value={selectedText.fontFamily}
                      onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                      aria-label="Font"
                      className="h-8 rounded-lg px-2 text-[13px] outline-none flex-shrink-0"
                      style={{ border: `1px solid ${LINE}`, width: 150, fontFamily: selectedText.fontFamily }}
                    >
                      {(["Brand", "Script", "Display", "Serif", "Sans"] as const).map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {FONT_LIBRARY.filter((f) => f.category === cat).map((f) => (
                            <option key={f.family} value={f.family}>
                              {f.family}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <div className="h-8 flex items-center rounded-lg flex-shrink-0" style={{ border: `1px solid ${LINE}` }}>
                      <button onClick={() => updateSelected({ fontSize: Math.max(6, selectedText.fontSize - 2) })} className="w-7 h-full" aria-label="Smaller">
                        −
                      </button>
                      <input
                        value={selectedText.fontSize}
                        onChange={(e) => Number(e.target.value) > 0 && updateSelected({ fontSize: Number(e.target.value) })}
                        aria-label="Font size"
                        className="w-9 text-center font-bold outline-none"
                        inputMode="numeric"
                      />
                      <button onClick={() => updateSelected({ fontSize: selectedText.fontSize + 2 })} className="w-7 h-full" aria-label="Bigger">
                        +
                      </button>
                    </div>
                    <CtxDivider />
                    <label className="flex-shrink-0 cursor-pointer" title="Text color">
                      <span className="block rounded-md" style={{ width: 24, height: 24, background: selectedText.fill, border: "2px solid #fff", boxShadow: `0 0 0 1px ${LINE}` }} />
                      <input type="color" value={selectedText.fill} onChange={(e) => updateSelected({ fill: e.target.value })} className="sr-only" />
                    </label>
                    <CtxBtn active={selectedText.fontStyle.includes("bold")} onClick={() => updateSelected({ fontStyle: toggleStyle(selectedText.fontStyle, "bold") as any })} title="Bold">
                      <b>B</b>
                    </CtxBtn>
                    <CtxBtn active={selectedText.fontStyle.includes("italic")} onClick={() => updateSelected({ fontStyle: toggleStyle(selectedText.fontStyle, "italic") as any })} title="Italic">
                      <i style={{ fontFamily: "Fraunces, serif" }}>I</i>
                    </CtxBtn>
                    <CtxBtn active={false} onClick={() => updateSelected({ align: selectedText.align === "left" ? "center" : selectedText.align === "center" ? "right" : "left" })} title={`Align: ${selectedText.align}`}>
                      <span style={{ width: 14, height: 14, display: "inline-block" }}>{selectedText.align === "left" ? <Icon.AlignLeft /> : selectedText.align === "right" ? <Icon.AlignRight /> : <Icon.AlignCenterH />}</span>
                    </CtxBtn>
                    <CtxDivider />
                    <CtxBtn active={false} onClick={() => setStyleDrawer("color")} title="Letter spacing and line height">
                      Spacing
                    </CtxBtn>
                    <CtxBtn active={!!selectedText.textEffect && selectedText.textEffect !== "none"} onClick={() => setStyleDrawer("textEffects")} title="Shadow, outline, glow, curve">
                      Effects
                    </CtxBtn>
                  </>
                )}
                {selectedImg && (
                  <>
                    <CtxBtn active={false} onClick={() => setPickerOpen(true)} title="Replace photo">
                      Replace
                    </CtxBtn>
                    <CtxBtn active={activeRailPanel === "edit"} onClick={() => setActiveRailPanel("edit")} title="Filters, adjust, remove background">
                      Edit photo
                    </CtxBtn>
                    <CtxBtn active={cropModeId === selectedImg.id} onClick={() => setCropModeId(cropModeId === selectedImg.id ? null : selectedImg.id)} title="Crop & reposition (Esc to finish)">
                      Crop
                    </CtxBtn>
                  </>
                )}
                {selectedIds.length > 1 && (
                  <>
                    <span className="font-bold flex-shrink-0" style={{ color: MUTED }}>
                      {selectedIds.length} selected
                    </span>
                    <CtxBtn active={false} onClick={selectionIsGrouped ? ungroupSelected : groupSelected} title={selectionIsGrouped ? "Ungroup (Ctrl+Shift+G)" : "Group (Ctrl+G)"}>
                      {selectionIsGrouped ? "Ungroup" : "Group"}
                    </CtxBtn>
                  </>
                )}
                <div className="flex-1" />
                <div className="relative flex-shrink-0">
                  <CtxBtn active={ctxMenu === "align"} onClick={() => setCtxMenu((m) => (m === "align" ? null : "align"))} title="Align on page">
                    Position
                  </CtxBtn>
                  {ctxMenu === "align" && (
                    <CtxMenu onClose={() => setCtxMenu(null)}>
                      {(
                        [
                          ["left", "Left", <Icon.AlignLeft key="l" />],
                          ["hcenter", "Center", <Icon.AlignCenterH key="c" />],
                          ["right", "Right", <Icon.AlignRight key="r" />],
                          ["top", "Top", <Icon.AlignTop key="t" />],
                          ["vcenter", "Middle", <Icon.AlignCenterV key="m" />],
                          ["bottom", "Bottom", <Icon.AlignBottom key="b" />],
                        ] as const
                      ).map(([pos, label, icon]) => (
                        <CtxMenuItem key={pos} icon={icon} label={label} onClick={() => align(pos)} />
                      ))}
                    </CtxMenu>
                  )}
                </div>
                {selectedIds.length === 1 && (
                  <div className="relative flex-shrink-0">
                    <CtxBtn active={ctxMenu === "layer"} onClick={() => setCtxMenu((m) => (m === "layer" ? null : "layer"))} title="Layer order">
                      Layer
                    </CtxBtn>
                    {ctxMenu === "layer" && (
                      <CtxMenu onClose={() => setCtxMenu(null)}>
                        <CtxMenuItem icon={<Icon.BringFront />} label="Bring to front" onClick={() => reorder("front")} />
                        <CtxMenuItem icon={<Icon.BringForward />} label="Bring forward" onClick={() => reorder("forward")} />
                        <CtxMenuItem icon={<Icon.SendBackward />} label="Send backward" onClick={() => reorder("backward")} />
                        <CtxMenuItem icon={<Icon.SendBack />} label="Send to back" onClick={() => reorder("back")} />
                      </CtxMenu>
                    )}
                  </div>
                )}
                <CtxBtn active={!!selected.locked} onClick={() => toggleLock()} title="Lock (Ctrl+L)">
                  {selected.locked ? "🔒 Locked" : "Lock"}
                </CtxBtn>
                <CtxIconBtn onClick={duplicateSelected} title="Duplicate (Ctrl+D)">
                  <Icon.Duplicate />
                </CtxIconBtn>
                <CtxIconBtn onClick={deleteSelected} title="Delete" danger>
                  <Icon.Delete />
                </CtxIconBtn>
              </>
            ) : (
              <>
                <label className="h-8 flex items-center gap-2 rounded-lg px-2.5 flex-shrink-0 cursor-pointer" style={{ border: `1px solid ${LINE}` }} title="Page background">
                  <span className="rounded" style={{ width: 16, height: 16, background, boxShadow: `0 0 0 1px ${LINE}` }} />
                  <span className="font-semibold">Background</span>
                  <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="sr-only" />
                </label>
                <select
                  onChange={(e) => {
                    const preset = CANVAS_SIZE_PRESETS[Number(e.target.value)];
                    if (preset) {
                      if (elements.length === 0 && pages.length === 1) {
                        setCanvasWidth(preset.width);
                        setCanvasHeight(preset.height);
                      } else if (smartResize) smartResizeTo(preset.width, preset.height);
                      else resizeTo(preset.width, preset.height);
                    }
                    e.target.value = "";
                  }}
                  disabled={resizing}
                  className="h-8 rounded-lg px-2 font-semibold outline-none cursor-pointer flex-shrink-0 disabled:opacity-60"
                  style={{ border: `1px solid ${LINE}`, width: 120 }}
                  defaultValue=""
                  title="Set or resize the canvas"
                >
                  <option value="" disabled>
                    {resizing ? "Resizing…" : "Resize…"}
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
                <label className="flex items-center gap-1.5 font-semibold cursor-pointer flex-shrink-0" style={{ color: smartResize ? "#1F6F54" : MUTED }} title="When on, resizing reflows elements to fit the new shape">
                  <input type="checkbox" checked={smartResize} onChange={(e) => setSmartResize(e.target.checked)} />
                  AI resize
                </label>
                <CtxDivider />
                <select value={program} onChange={(e) => setProgram(e.target.value)} className="h-8 rounded-lg px-2 font-semibold outline-none cursor-pointer flex-shrink-0" style={{ border: `1px solid ${LINE}` }} title="Program (template gallery filter)">
                  <option value="">Program…</option>
                  {PROGRAMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-8 rounded-lg px-2 font-semibold outline-none cursor-pointer flex-shrink-0" style={{ border: `1px solid ${LINE}` }} title="Language (template gallery filter)">
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" className="h-8 rounded-lg px-2.5 font-semibold outline-none flex-shrink-0 w-32" style={{ border: `1px solid ${LINE}` }} />
                <div className="flex-1" />
                <span className="hidden xl:inline flex-shrink-0" style={{ color: MUTED }}>
                  Select something on the canvas to edit it
                </span>
              </>
            )}
          </div>

          {/* Stage */}
          <div className="relative h-[52vh] min-h-[320px] lg:h-auto lg:flex-1 lg:min-h-0" style={{ background: SHELL_BG }}>
            <div ref={canvasAreaRef} className={`absolute inset-0 overflow-auto flex p-6 md:pl-[96px] md:pr-8 pb-16 ${showTip ? "pt-16" : ""}`}>
              <div style={{ margin: "auto", boxShadow: "0 10px 30px rgba(22,48,43,0.18)", position: "relative", flexShrink: 0 }}>
                <FlierCanvas
                  width={canvasWidth}
                  height={canvasHeight}
                  background={background}
                  elements={elements}
                  mode="builder"
                  selectedIds={selectedIds}
                  onSelect={selectOne}
                  onSelectMany={selectMany}
                  onChange={setElements}
                  onCommit={commit}
                  scale={zoom}
                  showSafeMargins={showSafeMargins}
                  snapEnabled={snapEnabled}
                  cropModeId={cropModeId}
                  onStageReady={(s) => (mainStageRef.current = s)}
                  onImageMeta={(id, w, h) =>
                    setPages((ps) => ps.map((p, i) => (i === pageIndex ? { ...p, elements: p.elements.map((e) => (e.id === id ? ({ ...e, naturalWidth: w, naturalHeight: h } as FlierElement) : e)) } : p)))
                  }
                />
                {(aiTool === "erase" || aiTool === "fill") && selectedImage && (
                  <MaskPainter el={selectedImage} scale={zoom} brushSize={brushSize} busy={aiBusy} onApply={runMaskedEdit} onCancel={() => setAiTool(null)} />
                )}
              </div>
            </div>

            {/* Pages strip */}
            <div className="hidden md:flex absolute left-4 top-3.5 bottom-16 flex-col gap-2 overflow-y-auto overflow-x-visible pr-2 z-10" style={{ width: 72 }}>
              {pages.map((p, i) => (
                <PageThumb key={p.id} page={p} index={i} active={i === pageIndex} width={canvasWidth} height={canvasHeight} onClick={() => { setPageIndex(i); setSelectedIds([]); setCropModeId(null); }} onDelete={() => deletePage(i)} onMoveUp={() => movePage(i, -1)} onMoveDown={() => movePage(i, 1)} onDuplicate={() => { setPageIndex(i); setTimeout(() => addPage(true), 0); }} canDelete={pages.length > 1} />
              ))}
              <button onClick={() => addPage(false)} className="rounded-md text-base flex-shrink-0" style={{ width: 58, height: 32, border: "1px dashed #9AA8A2", color: MUTED }} title="Add page" aria-label="Add page">
                +
              </button>
            </div>

            {showTip && (
              <div className="absolute left-1/2 -translate-x-1/2 top-3 z-10 flex items-center gap-3 rounded-full pl-4 pr-2 py-1.5 text-xs max-w-[min(640px,calc(100%-32px))]" style={{ background: INK, color: "#fff", boxShadow: "0 8px 24px rgba(22,48,43,0.25)" }}>
                <span className="truncate">
                  <span className="font-bold" style={{ color: "#E8CE96" }}>
                    Tip:
                  </span>{" "}
                  add from the left, style from the bar above. Shift-click to multi-select, Ctrl+G groups, Ctrl+L locks.
                </span>
                <button onClick={dismissTip} className="rounded-full px-3 py-1 font-bold flex-shrink-0" style={{ background: "rgba(255,255,255,0.14)" }}>
                  Got it
                </button>
              </div>
            )}

            {/* Guides */}
            <div className="absolute left-4 md:left-[92px] bottom-3.5 flex gap-1.5 text-[11px] font-bold z-10">
              <button onClick={() => setSnapEnabled((s) => !s)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: "#fff", border: `1px solid ${LINE}`, color: snapEnabled ? INK : "#9AA8A2" }} title="Snap to edges, centers and other elements">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: snapEnabled ? "#D946EF" : "#DDE4DF", display: "inline-block" }} />
                Snap guides {snapEnabled ? "on" : "off"}
              </button>
              <button onClick={() => setShowSafeMargins((s) => !s)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: "#fff", border: `1px solid ${LINE}`, color: showSafeMargins ? INK : "#9AA8A2" }} title="Show the print-safe margin">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: showSafeMargins ? "#3E7C9A" : "#DDE4DF", display: "inline-block" }} />
                Safe margins
              </button>
            </div>

            {/* Size + zoom */}
            <div className="absolute right-4 bottom-3.5 flex items-center gap-1 rounded-full pl-3 pr-1 py-1 text-[11px] font-bold z-10" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
              <span className="hidden sm:inline truncate max-w-[220px]" style={{ color: MUTED }}>
                {cropModeId ? "Crop mode · Esc to finish" : `${pages.length > 1 ? `${page.name} · ` : ""}${sizePreset ? `${sizePreset.label} · ` : ""}${canvasWidth} × ${canvasHeight}`}
              </span>
              <span className="hidden sm:inline mx-1" style={{ width: 1, height: 16, background: LINE }} />
              <button onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))} className="w-6 h-6 rounded-full hover:bg-black/[0.05]" aria-label="Zoom out">
                −
              </button>
              <button onClick={fitZoom} className="w-11 text-center hover:underline" title="Fit to screen">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} className="w-6 h-6 rounded-full hover:bg-black/[0.05]" aria-label="Zoom in">
                +
              </button>
            </div>
          </div>
        </div>

        {/* ---------- Right panel: properties + layers ---------- */}
        <aside className="w-full lg:w-[280px] flex-shrink-0 lg:overflow-y-auto" style={{ background: "#fff", borderLeft: `1px solid ${LINE}` }}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <span className="text-[13px] font-extrabold">{!selected ? "Properties" : selectedIds.length > 1 ? "Selection" : layerLabel(selected)}</span>
            {selected && selectedIds.length === 1 && (
              <span className="text-[11px] capitalize" style={{ color: MUTED }}>
                {selected.type}
              </span>
            )}
          </div>
          <div>
                {!selected ? (
                  <p className="text-xs p-4" style={{ color: "rgba(22,48,43,0.45)" }}>
                    Select an element to edit it, or add one from the left. Double-click text to edit in place. Shift-click to multi-select, Ctrl+G to group, Ctrl+L to lock, arrows nudge.
                  </p>
                ) : selectedIds.length > 1 ? (
                  <div className="p-4 space-y-2">
                    <p className="text-xs font-bold">{selectedIds.length} elements selected</p>
                    <div className="flex gap-1.5">
                      {selectionIsGrouped ? <SegBtn active={false} onClick={ungroupSelected}>Ungroup</SegBtn> : <SegBtn active={false} onClick={groupSelected}>Group</SegBtn>}
                      <SegBtn active={false} onClick={() => toggleLock()}>
                        Lock
                      </SegBtn>
                    </div>
                    <SliderRow label="Opacity" min={0} max={1} step={0.05} value={(selected as any).opacity ?? 1} onChange={() => {}} onCommit={(v) => updateAllSelected({ opacity: v } as any)} />
                    {selectedAll.every((e) => e.type === "text") && <ColorSwatchRow value={(selected as any).fill} onChange={(c) => updateAllSelected({ fill: c } as any)} />}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center px-1.5 pt-1.5" style={{ borderBottom: "1.5px solid #F0F4F1" }}>
                      <TabBtn active={panelTab === "style"} onClick={() => setPanelTab("style")} icon={<Icon.Style />} label="Style" />
                      {hasEffectsTab && <TabBtn active={panelTab === "effects"} onClick={() => setPanelTab("effects")} icon={<Icon.Effects />} label="Effects" />}
                    </div>

                    <div className="p-4 space-y-3">
                      {panelTab === "style" && (
                        <>
                          {selected.type === "text" && (
                            <>
                              <textarea value={selected.text} onChange={(e) => updateSelected({ text: e.target.value }, false)} onBlur={(e) => updateSelected({ text: e.target.value })} rows={2} className="w-full rounded-lg px-2.5 py-2 text-sm" style={{ border: "1px solid var(--portal-line)" }} />
                              <div className="space-y-2 mt-2">
                                <CategoryButton label="Font" onClick={() => setStyleDrawer("font")} />
                                <CategoryButton label="Color & spacing" onClick={() => setStyleDrawer("color")} />
                                <CategoryButton label={`Text effects${selected.textEffect && selected.textEffect !== "none" ? ` · ${selected.textEffect}` : ""}`} onClick={() => setStyleDrawer("textEffects")} />
                              </div>

                              <Drawer title="Font" open={styleDrawer === "font"} onClose={() => setStyleDrawer(null)}>
                                <select value={selected.fontFamily} onChange={(e) => updateSelected({ fontFamily: e.target.value })} className="w-full rounded-lg px-2.5 py-2 text-sm mb-2" style={{ border: "1px solid var(--portal-line)" }}>
                                  {(["Brand", "Script", "Display", "Serif", "Sans"] as const).map((cat) => (
                                    <optgroup key={cat} label={cat}>
                                      {FONT_LIBRARY.filter((f) => f.category === cat).map((f) => (
                                        <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                                          {f.family}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                                <div className="flex gap-2">
                                  <input type="number" value={selected.fontSize} onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })} className="w-1/2 rounded-lg px-2.5 py-2 text-sm" style={{ border: "1px solid var(--portal-line)" }} />
                                  <div className="flex flex-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--portal-line)" }}>
                                    <ToggleIconBtn active={selected.fontStyle.includes("bold")} onClick={() => updateSelected({ fontStyle: toggleStyle(selected.fontStyle, "bold") as any })} icon={<Icon.Bold />} />
                                    <ToggleIconBtn active={selected.fontStyle.includes("italic")} onClick={() => updateSelected({ fontStyle: toggleStyle(selected.fontStyle, "italic") as any })} icon={<Icon.Italic />} />
                                    <ToggleIconBtn active={selected.align === "left"} onClick={() => updateSelected({ align: "left" })} icon={<Icon.AlignLeft />} />
                                    <ToggleIconBtn active={selected.align === "center"} onClick={() => updateSelected({ align: "center" })} icon={<Icon.AlignCenterH />} />
                                    <ToggleIconBtn active={selected.align === "right"} onClick={() => updateSelected({ align: "right" })} icon={<Icon.AlignRight />} />
                                  </div>
                                </div>
                              </Drawer>

                              <Drawer title="Color & spacing" open={styleDrawer === "color"} onClose={() => setStyleDrawer(null)}>
                                <SliderRow label="Letter sp." min={-2} max={20} step={1} value={selected.letterSpacing} onChange={(v) => updateSelected({ letterSpacing: v }, false)} onCommit={(v) => updateSelected({ letterSpacing: v })} />
                                <SliderRow label="Line height" min={0.8} max={2.2} step={0.02} value={selected.lineHeight} onChange={(v) => updateSelected({ lineHeight: v }, false)} onCommit={(v) => updateSelected({ lineHeight: v })} />
                                <ColorSwatchRow value={selected.fill} onChange={(c) => updateSelected({ fill: c })} />
                              </Drawer>

                              <Drawer title="Text effects" open={styleDrawer === "textEffects"} onClose={() => setStyleDrawer(null)}>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  {(["none", "shadow", "outline", "glow", "background", "curve"] as TextEffect[]).map((fx) => (
                                    <button key={fx} onClick={() => updateSelected({ ...DEFAULT_TEXT_EFFECT, effectColor: selected.effectColor ?? DEFAULT_TEXT_EFFECT.effectColor, effectStrength: selected.effectStrength ?? DEFAULT_TEXT_EFFECT.effectStrength, curveRadius: selected.curveRadius ?? DEFAULT_TEXT_EFFECT.curveRadius, textEffect: fx } as any)} className="rounded-xl py-2 flex flex-col items-center gap-1" style={{ border: (selected.textEffect ?? "none") === fx ? "2px solid var(--portal-emerald)" : "1px solid var(--portal-line)", background: (selected.textEffect ?? "none") === fx ? "#F3F8F6" : "#fff" }}>
                                      <EffectPreview fx={fx} color={selected.effectColor ?? "#C99A3D"} />
                                      <span className="text-[10px] font-bold capitalize" style={{ color: "#5F7A6D" }}>
                                        {fx}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                                {selected.textEffect && selected.textEffect !== "none" && (
                                  <>
                                    {selected.textEffect !== "curve" && (
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
                                          Color
                                        </span>
                                        <ColorSwatchRow value={selected.effectColor ?? "#C99A3D"} onChange={(c) => updateSelected({ effectColor: c } as any)} compact />
                                      </div>
                                    )}
                                    {selected.textEffect !== "curve" && (
                                      <SliderRow label="Strength" min={0} max={100} step={1} value={selected.effectStrength ?? 40} onChange={(v) => updateSelected({ effectStrength: v } as any, false)} onCommit={(v) => updateSelected({ effectStrength: v } as any)} />
                                    )}
                                    {selected.textEffect === "curve" && (
                                      <SliderRow label="Bend" min={80} max={1200} step={10} value={selected.curveRadius ?? 300} onChange={(v) => updateSelected({ curveRadius: v } as any, false)} onCommit={(v) => updateSelected({ curveRadius: v } as any)} />
                                    )}
                                  </>
                                )}
                              </Drawer>
                            </>
                          )}

                          {selected.type === "image" && (
                            <div className="space-y-2">
                              <button onClick={() => setPickerOpen(true)} className="text-xs px-3 py-2.5 rounded-full cursor-pointer w-full font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-transform duration-150" style={{ border: "1.5px solid var(--portal-emerald)", color: "var(--portal-emerald)" }}>
                                <span style={{ width: 14, height: 14 }}>
                                  <Icon.ImagePicker />
                                </span>
                                {selected.imageUrl ? "Change Image" : "Choose Image"}
                              </button>
                              <button onClick={() => setActiveRailPanel("edit")} className="text-xs px-3 py-2.5 rounded-full cursor-pointer w-full font-bold" style={{ background: "#F7FAF8", border: "1px solid var(--portal-line)", color: "#2F4A3E" }}>
                                Edit image →
                              </button>
                              {selected.naturalWidth && (
                                <p className="text-[11px]" style={{ color: DIM }}>
                                  Source {selected.naturalWidth} × {selected.naturalHeight} px
                                </p>
                              )}
                            </div>
                          )}

                          {selected.type === "circle" && (
                            <div>
                              <ColorSwatchRow value={selected.fill} onChange={(c) => updateSelected({ fill: c })} />
                              <GradientControls selected={selected} updateSelected={updateSelected} />
                            </div>
                          )}

                          {selected.type === "rect" && (
                            <div className="space-y-2">
                              <CategoryButton label="Fill" onClick={() => setStyleDrawer("fill")} />
                              <CategoryButton label="Shape" onClick={() => setStyleDrawer("rectShape")} />
                              <Drawer title="Fill" open={styleDrawer === "fill"} onClose={() => setStyleDrawer(null)}>
                                <ColorSwatchRow value={selected.fill} onChange={(c) => updateSelected({ fill: c })} />
                                <GradientControls selected={selected} updateSelected={updateSelected} />
                              </Drawer>
                              <Drawer title="Shape" open={styleDrawer === "rectShape"} onClose={() => setStyleDrawer(null)}>
                                <SliderRow label="Corners" min={0} max={Math.min(selected.width, selected.height) / 2} step={1} value={selected.cornerRadius} onChange={(v) => updateSelected({ cornerRadius: v }, false)} onCommit={(v) => updateSelected({ cornerRadius: v })} />
                              </Drawer>
                            </div>
                          )}

                          {(selected.type === "star" || selected.type === "polygon" || selected.type === "arrow" || selected.type === "icon") && <ColorSwatchRow value={(selected as any).fill} onChange={(c) => updateSelected({ fill: c })} />}
                          {selected.type === "star" && <SliderRow label="Points" min={3} max={12} step={1} value={selected.numPoints} onChange={(v) => updateSelected({ numPoints: v }, false)} onCommit={(v) => updateSelected({ numPoints: v })} />}
                          {selected.type === "polygon" && <SliderRow label="Sides" min={3} max={10} step={1} value={selected.sides} onChange={(v) => updateSelected({ sides: v }, false)} onCommit={(v) => updateSelected({ sides: v })} />}
                          {selected.type === "line" && (
                            <>
                              <ColorSwatchRow value={selected.stroke} onChange={(c) => updateSelected({ stroke: c })} />
                              <SliderRow label="Thickness" min={1} max={20} step={1} value={selected.strokeWidth} onChange={(v) => updateSelected({ strokeWidth: v }, false)} onCommit={(v) => updateSelected({ strokeWidth: v })} />
                            </>
                          )}

                          <div className="pt-3 space-y-2" style={{ borderTop: "1px solid var(--portal-line)" }}>
                            <div className="grid grid-cols-4 gap-1.5">
                              <NumField label="X" value={selected.x} onChange={(v) => updateSelected({ x: v })} />
                              <NumField label="Y" value={selected.y} onChange={(v) => updateSelected({ y: v })} />
                              <NumField label="W" value={selected.width} onChange={(v) => updateSelected({ width: Math.max(10, v) })} />
                              <NumField label="H" value={selected.height} onChange={(v) => updateSelected({ height: Math.max(10, v) })} />
                            </div>
                            <div className="flex gap-1.5">
                              <SegBtn active={!!selected.locked} onClick={() => toggleLock(selected.id)}>
                                {selected.locked ? "Unlock" : "Lock"}
                              </SegBtn>
                              <SegBtn active={false} onClick={() => renameLayer(selected.id)}>
                                Rename
                              </SegBtn>
                              {selected.groupId && (
                                <SegBtn active={false} onClick={ungroupSelected}>
                                  Ungroup
                                </SegBtn>
                              )}
                            </div>
                          </div>
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

                      {panelTab === "effects" && (selected.type === "text" || selected.type === "star" || selected.type === "polygon" || selected.type === "arrow" || selected.type === "icon") && (
                        <SliderRow label="Opacity" min={0} max={1} step={0.05} value={(selected as any).opacity ?? 1} onChange={(v) => updateSelected({ opacity: v } as any, false)} onCommit={(v) => updateSelected({ opacity: v } as any)} />
                      )}

                      {(selected.type === "text" || selected.type === "image") && (
                        <div className="pt-3" style={{ borderTop: "1px solid var(--portal-line)" }}>
                          <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer">
                            <input type="checkbox" checked={selected.editable} onChange={(e) => updateSelected({ editable: e.target.checked })} />
                            Editable by field offices
                          </label>
                          {selected.editable && (
                            <input value={(selected as any).editableLabel ?? ""} onChange={(e) => updateSelected({ editableLabel: e.target.value } as any, false)} onBlur={(e) => updateSelected({ editableLabel: e.target.value } as any)} placeholder="Field label (e.g. Event Title)" className="w-full rounded-lg px-2.5 py-2 text-xs" style={{ border: "1px solid var(--portal-line)" }} />
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
          </div>
          <div style={{ height: 1, background: LINE }} />
          <div className="px-3 pt-3 pb-4">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide mb-2 px-1" style={{ color: DIM }}>
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 12, height: 12 }}>
                      <Icon.Layers />
                    </span>
                    Layers ({elements.length})
                  </span>
                  <span>{page.name}</span>
                </div>
                <div className="space-y-0.5 max-h-56 lg:max-h-none overflow-y-auto">
                  {[...elements].reverse().map((el, idx, arr) => {
                    const prev = arr[idx - 1];
                    const groupStart = el.groupId && (!prev || prev.groupId !== el.groupId);
                    return (
                      <div key={el.id}>
                        {groupStart && (
                          <div className="text-[10px] px-2 pt-1.5 pb-0.5 font-bold" style={{ color: "#7A9186" }}>
                            ▾ Group
                          </div>
                        )}
                        <div
                          onClick={(e) => (el.locked ? setSelectedIds([el.id]) : selectMany([el.id], e.shiftKey || e.metaKey || e.ctrlKey))}
                          onDoubleClick={() => renameLayer(el.id)}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-lg cursor-pointer flex items-center gap-2 transition-colors"
                          style={{
                            background: selectedIds.includes(el.id) ? "#F3F8F6" : "transparent",
                            color: selectedIds.includes(el.id) ? "var(--portal-emerald)" : el.locked ? "#9AA8A2" : "#444",
                            paddingLeft: el.groupId ? 18 : 10,
                          }}
                        >
                          <span style={{ width: 14, height: 14, display: "inline-block", flexShrink: 0 }}>{ICONS[el.type as keyof typeof ICONS]}</span>
                          <span className="truncate flex-1">{layerLabel(el)}</span>
                          {(el as any).editable && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: "#E8F4EE", color: "var(--portal-emerald)" }}>
                              EDITABLE
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLock(el.id);
                            }}
                            title={el.locked ? "Unlock" : "Lock"}
                            className="flex-shrink-0 text-[11px]"
                            style={{ color: el.locked ? "#16302B" : "#C5CFC9" }}
                          >
                            {el.locked ? "🔒" : "🔓"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {elements.length === 0 && (
                    <p className="text-xs px-1" style={{ color: "rgba(22,48,43,0.4)" }}>
                      No elements yet.
                    </p>
                  )}
                </div>
          </div>
        </aside>
      </div>

      {/* ---------- Phone: selection actions + tools ---------- */}
      <div className="lg:hidden sticky bottom-0 z-30">
              {selected && (
                <div className="flex justify-center py-2">
                  <FloatingToolbar el={selected} multi={selectedIds.length > 1} grouped={selectionIsGrouped} onDuplicate={duplicateSelected} onDelete={deleteSelected} onAlign={align} onReorder={reorder} onEdit={() => setActiveRailPanel("edit")} onCrop={() => setCropModeId(selected.id)} onGroup={groupSelected} onUngroup={ungroupSelected} onLock={() => toggleLock()} />
                </div>
              )}
              <div className="flex flex-row gap-1 overflow-x-auto rounded-t-3xl p-2.5" style={{ background: "#fff", boxShadow: "0 -4px 16px rgba(22,48,43,0.08)", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
                {railButtons}
              </div>
      </div>

      {activeRailPanel && (
        <div className="lg:hidden fixed inset-0 flex items-end justify-center z-50" style={{ background: "rgba(22,48,43,0.5)" }} onClick={() => setActiveRailPanel(null)}>
          <div className="bg-white p-5 w-full rounded-t-3xl max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-2">
              <div className="w-9 h-1 rounded-full" style={{ background: "var(--portal-line)" }} />
            </div>
            {activeRailPanel === "text" ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold">Text</h3>
                  <button onClick={() => setActiveRailPanel(null)} className="text-sm cursor-pointer" style={{ color: DIM }}>
                    ✕
                  </button>
                </div>
                {textPanelContent}
              </>
            ) : activeRailPanel === "elements" ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold">Elements</h3>
                  <button onClick={() => setActiveRailPanel(null)} className="text-sm cursor-pointer" style={{ color: DIM }}>
                    ✕
                  </button>
                </div>
                {elementsPanelContent}
              </>
            ) : activeRailPanel === "edit" ? (
              editImagePanel
            ) : activeRailPanel === "ai" ? (
              aiStudioPanel
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
            updateSelected({ dropboxPath: img.dropbox_path, imageUrl: img.link, naturalWidth: undefined, naturalHeight: undefined } as any);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Export sheet: hi-res PNG/JPG, print PDF, multi-size, preflight. Mounts a
// hidden full-scale stage per page so every page can be captured without
// flipping the visible editor through them.
// ---------------------------------------------------------------------
function ExportSheet({
  pages,
  canvasWidth,
  canvasHeight,
  templateName,
  templateId,
  issues,
  onClose,
  onFixIssue,
}: {
  pages: FlierPage[];
  canvasWidth: number;
  canvasHeight: number;
  templateName: string;
  templateId: string;
  issues: ReturnType<typeof preflight>;
  onClose: () => void;
  onFixIssue: (elementId: string) => void;
}) {
  const supabase = createClient();
  const [format, setFormat] = useState<"png" | "jpg" | "pdf">("png");
  const [quality, setQuality] = useState<"web" | "hi" | "print">("hi");
  const [paperId, setPaperId] = useState("letter");
  const [bleed, setBleed] = useState(true);
  const [cropMarks, setCropMarks] = useState(true);
  const [extraSizes, setExtraSizes] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const stageRefs = useRef<Record<number, Konva.Stage | null>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    waitForAssets(pages).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [pages]);

  const pixelRatio = quality === "web" ? 1 : quality === "hi" ? 2 : 3;
  const paper = PRINT_PRESETS.find((p) => p.id === paperId);
  const printIssues = useMemo(() => preflight(pages, canvasWidth, canvasHeight, { targetDpi: 300, printWidthIn: paper && paper.widthIn ? paper.widthIn : canvasWidth / 300 }), [pages, canvasWidth, canvasHeight, paper]);
  const shown = format === "pdf" ? printIssues : issues;
  const fileBase = slug(templateName);

  async function logDownload() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
      if (employee) await supabase.from("flier_downloads").insert({ template_id: templateId, employee_id: employee.id });
    } catch {}
  }

  async function run() {
    setBusy("Rendering…");
    setDone(null);
    try {
      await waitForAssets(pages);
      const getStage = (i: number) => stageRefs.current[i] ?? null;
      let count = 0;
      if (format === "pdf") {
        const { filename, blob } = await exportPagesAsPdf(pages, canvasWidth, canvasHeight, getStage, { format: "pdf", pixelRatio, paper: paper && paper.widthIn ? { widthIn: paper.widthIn, heightIn: paper.heightIn } : null, bleed, cropMarks, fileBase });
        downloadDataUrl(URL.createObjectURL(blob), filename);
        count = 1;
      } else {
        const files = await exportPagesAsImages(pages, getStage, { format, pixelRatio, fileBase });
        for (const f of files) {
          downloadDataUrl(f.dataUrl, f.filename);
          await new Promise((r) => setTimeout(r, 250));
        }
        count = files.length;
      }
      // Extra sizes: plain proportional resize of page 1 rendered via a
      // throwaway stage is more plumbing than it's worth here - instead we
      // export the current canvas and note the sizes to use Resize for.
      setDone(`Downloaded ${count} file${count === 1 ? "" : "s"}${extraSizes.length ? ` · use Resize… for ${extraSizes.map((i) => CANVAS_SIZE_PRESETS[i].label).join(", ")}` : ""}`);
      logDownload();
    } catch (e: any) {
      setDone(`Export failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(22,48,43,0.35)" }} onClick={onClose}>
      {/* Hidden full-scale stages used for capture */}
      <div style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }} aria-hidden>
        {pages.map((p, i) => (
          <div key={p.id} style={{ marginBottom: 8 }}>
            <FlierCanvas width={canvasWidth} height={canvasHeight} background={p.background} elements={p.elements} mode="preview" scale={1} onStageReady={(s) => (stageRefs.current[i] = s)} />
          </div>
        ))}
      </div>

      <div className="bg-white w-full max-w-[420px] h-full overflow-y-auto flex flex-col" style={{ boxShadow: "-12px 0 40px rgba(22,48,43,0.25)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <div className="text-lg font-extrabold">Export</div>
            <div className="text-xs font-semibold" style={{ color: DIM }}>
              {templateName} · {pages.length} page{pages.length === 1 ? "" : "s"} · {canvasWidth}×{canvasHeight}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full" style={{ background: "#FBF7EF" }}>
            ✕
          </button>
        </div>

        <div className="px-6 space-y-5 text-xs flex-1">
          <div>
            <div className="font-extrabold mb-2">File type</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["png", "PNG", "Social · transparent"],
                  ["jpg", "JPG", "Email · smaller"],
                  ["pdf", "PDF Print", "300 DPI · bleed"],
                ] as const
              ).map(([id, label, sub]) => (
                <button key={id} onClick={() => setFormat(id)} className="h-16 rounded-xl flex flex-col items-center justify-center gap-1 font-bold" style={{ border: format === id ? "2px solid var(--portal-emerald)" : "1px solid var(--portal-line)", background: format === id ? "#E8F4EE" : "#fff", color: format === id ? "var(--portal-emerald)" : "#16302B" }}>
                  <span>{label}</span>
                  <span className="text-[10px] font-semibold" style={{ color: DIM }}>
                    {sub}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {format !== "pdf" ? (
            <div>
              <div className="font-extrabold mb-2">Quality</div>
              <div className="flex gap-1.5">
                <SegBtn active={quality === "web"} onClick={() => setQuality("web")}>
                  1× web
                </SegBtn>
                <SegBtn active={quality === "hi"} onClick={() => setQuality("hi")}>
                  2× sharp
                </SegBtn>
                <SegBtn active={quality === "print"} onClick={() => setQuality("print")}>
                  3× print
                </SegBtn>
              </div>
              <p className="mt-1.5" style={{ color: DIM }}>
                Output {canvasWidth * pixelRatio} × {canvasHeight * pixelRatio} px
              </p>
            </div>
          ) : (
            <div>
              <div className="font-extrabold mb-2">Print settings</div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--portal-line)" }}>
                <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--portal-line)" }}>
                  <span className="font-semibold">Paper size</span>
                  <select value={paperId} onChange={(e) => setPaperId(e.target.value)} className="text-xs font-bold bg-transparent">
                    {PRINT_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--portal-line)" }}>
                  <span className="font-semibold">Resolution</span>
                  <span className="font-bold">300 DPI · {paper && paper.widthIn ? `${Math.round(paper.widthIn * 300)} × ${Math.round(paper.heightIn * 300)} px` : `${canvasWidth} × ${canvasHeight} px`}</span>
                </div>
                <Toggle label="Bleed (⅛ in)" on={bleed} onChange={setBleed} />
                <Toggle label="Crop marks" on={cropMarks} onChange={setCropMarks} last />
              </div>
              <p className="mt-1.5" style={{ color: DIM }}>
                Color is exported as RGB; ask the print shop to convert to CMYK, or tell them "sRGB, no color correction" for digital presses.
                {paper && paper.widthIn && Math.abs(paper.widthIn / paper.heightIn - canvasWidth / canvasHeight) > 0.03 ? " The canvas aspect differs from the paper, so it's cover-fit and lightly cropped — use Safe margins in the editor." : ""}
              </p>
            </div>
          )}

          <div>
            <div className="font-extrabold mb-2">Also need other sizes?</div>
            <div className="flex flex-wrap gap-1.5">
              {CANVAS_SIZE_PRESETS.slice(2, 8).map((p, i) => {
                const idx = i + 2;
                const on = extraSizes.includes(idx);
                return (
                  <button key={p.label} onClick={() => setExtraSizes((s) => (on ? s.filter((x) => x !== idx) : [...s, idx]))} className="px-2.5 py-1.5 rounded-full text-[11px] font-bold" style={{ background: on ? "#16302B" : "#fff", color: on ? "#fff" : "#16302B", border: "1px solid var(--portal-line)" }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5" style={{ color: DIM }}>
              Use Resize… with AI resize on to reflow this design, then export again.
            </p>
          </div>

          <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: "#FBF7EF" }}>
            <div className="font-extrabold">Preflight {shown.length ? `· ${shown.length} issue${shown.length > 1 ? "s" : ""}` : "· all clear"}</div>
            {shown.slice(0, 6).map((it, i) => (
              <button key={i} onClick={() => it.elementId && onFixIssue(it.elementId)} className="w-full text-left flex gap-2 items-start" style={{ color: it.level === "error" ? "#B55139" : "#8A5A1E" }}>
                <span>{it.level === "error" ? "⛔" : "⚠"}</span>
                <span className="font-semibold">{it.message}</span>
              </button>
            ))}
            {shown.length > 6 && <p style={{ color: DIM }}>+{shown.length - 6} more in Brand check</p>}
          </div>
        </div>

        <div className="px-6 py-4 space-y-2" style={{ borderTop: "1px solid var(--portal-line)" }}>
          <button onClick={run} disabled={!!busy || !ready} className="w-full h-11 rounded-full text-white font-extrabold text-sm disabled:opacity-60" style={{ background: "var(--portal-emerald)" }}>
            {busy ?? (!ready ? "Loading fonts & photos…" : format === "pdf" ? "Download PDF" : `Download ${pages.length > 1 ? `${pages.length} files` : format.toUpperCase()}`)}
          </button>
          {done && (
            <p className="text-xs text-center" style={{ color: done.startsWith("Export failed") ? "#B55139" : "var(--portal-emerald)" }}>
              {done}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange, last }: { label: string; on: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <label className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer" style={last ? undefined : { borderBottom: "1px solid var(--portal-line)" }}>
      <span className="font-semibold">{label}</span>
      <span onClick={() => onChange(!on)} className="relative inline-block w-9 h-5 rounded-full transition-colors" style={{ background: on ? "var(--portal-emerald)" : "#DDE4DF" }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------
// Mask painter overlay for Magic Erase / Generative Fill: an HTML canvas
// over the selected photo (in screen space) the user brushes on; Apply
// converts the strokes into a source-pixel-space RGBA mask (alpha 0 =
// repaint) using the same cover-crop math the renderer uses.
// ---------------------------------------------------------------------
function MaskPainter({ el, scale, brushSize, busy, onApply, onCancel }: { el: FlierImageElement; scale: number; brushSize: number; busy: boolean; onApply: (maskDataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ x: number; y: number; r: number }[]>([]);
  const painting = useRef(false);
  const w = el.width * scale;
  const h = el.height * scale;

  function paintAt(e: React.PointerEvent) {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale; // frame px
    const y = (e.clientY - rect.top) / scale;
    strokes.current.push({ x, y, r: brushSize / 2 });
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(217,70,239,0.55)";
    ctx.beginPath();
    ctx.arc(x * scale, y * scale, (brushSize / 2) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  function clear() {
    strokes.current = [];
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }
  function apply() {
    if (strokes.current.length === 0 || !el.naturalWidth || !el.naturalHeight) return;
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    const { cropX, cropY, cropWidth, cropHeight } = computeCoverCrop(nw, nh, el.width, el.height, el.cropZoom, el.cropOffsetX, el.cropOffsetY);
    const sx = cropWidth / el.width; // frame px -> source px
    const sy = cropHeight / el.height;
    const m = document.createElement("canvas");
    m.width = nw;
    m.height = nh;
    const ctx = m.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, nw, nh); // opaque = keep
    ctx.globalCompositeOperation = "destination-out"; // punch transparent holes
    for (const s of strokes.current) {
      const fx = el.flipX ? el.width - s.x : s.x;
      const fy = el.flipY ? el.height - s.y : s.y;
      ctx.beginPath();
      ctx.arc(cropX + fx * sx, cropY + fy * sy, s.r * Math.max(sx, sy), 0, Math.PI * 2);
      ctx.fill();
    }
    onApply(m.toDataURL("image/png"));
  }

  return (
    <div style={{ position: "absolute", left: el.x * scale, top: el.y * scale, width: w, height: h, transform: `rotate(${el.rotation}deg)`, transformOrigin: "0 0", zIndex: 30 }}>
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        style={{ position: "absolute", inset: 0, cursor: "crosshair", borderRadius: el.maskShape === "circle" ? "50%" : el.maskShape === "rounded" ? el.maskCornerRadius * scale : 0, outline: "2px solid #D946EF" }}
        onPointerDown={(e) => {
          painting.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          paintAt(e);
        }}
        onPointerMove={(e) => painting.current && paintAt(e)}
        onPointerUp={() => (painting.current = false)}
        onPointerLeave={() => (painting.current = false)}
      />
      <div className="absolute left-1/2 -translate-x-1/2 flex gap-1.5" style={{ top: -44 }}>
        <button onClick={clear} disabled={busy} className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: "#1F2A24" }}>
          Clear
        </button>
        <button onClick={apply} disabled={busy} className="px-3 py-1.5 rounded-full text-xs font-bold text-white disabled:opacity-60" style={{ background: "#D946EF" }}>
          {busy ? "Working…" : "Apply"}
        </button>
        <button onClick={onCancel} disabled={busy} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#fff" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PageThumb({ page, index, active, width, height, onClick, onDelete, onMoveUp, onMoveDown, onDuplicate, canDelete }: { page: FlierPage; index: number; active: boolean; width: number; height: number; onClick: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void; onDuplicate: () => void; canDelete: boolean }) {
  const [menu, setMenu] = useState(false);
  const thumbW = 58;
  const thumbH = Math.round((thumbW * height) / width);
  return (
    <div className="relative" onMouseLeave={() => setMenu(false)}>
      <button
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
        className="block rounded-lg overflow-hidden relative"
        style={{ width: thumbW, height: Math.min(thumbH, 110), background: page.background, border: active ? "2px solid var(--portal-emerald)" : "1px solid var(--portal-line)" }}
        title={`${page.name} · right-click for options`}
      >
        {/* Miniature: just boxes where elements sit - cheap and honest */}
        {page.elements.slice(0, 40).map((e) => {
          const box: React.CSSProperties = { position: "absolute", left: (e.x / width) * thumbW, top: (e.y / height) * thumbH, width: Math.max(1, (e.width / width) * thumbW), height: Math.max(1, (e.height / height) * thumbH), borderRadius: e.type === "circle" ? "50%" : 1, overflow: "hidden" };
          const url = e.type === "image" ? (e as any).imageUrl : null;
          // eslint-disable-next-line @next/next/no-img-element
          if (url) return <img key={e.id} src={url} alt="" style={{ ...box, objectFit: "cover" }} />;
          return <span key={e.id} style={{ ...box, background: e.type === "text" ? "#16302B" : e.type === "image" ? "#C99A3D" : (e as any).fill ?? "#1F6F54", opacity: e.type === "text" ? 0.45 : 0.7 }} />;
        })}
        <span className="absolute left-1 bottom-0.5 text-[9px] font-extrabold" style={{ color: active ? "var(--portal-emerald)" : "#7A9186" }}>
          {index + 1}
        </span>
      </button>
      <button onClick={() => setMenu((m) => !m)} className="absolute -right-1 -top-1 w-4 h-4 rounded-full text-[10px] leading-none" style={{ background: "#fff", border: "1px solid var(--portal-line)", color: "#7A9186" }} title="Page options">
        ⋯
      </button>
      {menu && (
        <div className="absolute left-full top-0 ml-1 z-40 rounded-xl py-1 text-xs whitespace-nowrap" style={{ background: "#fff", boxShadow: "0 6px 20px rgba(22,48,43,0.2)", border: "1px solid var(--portal-line)" }}>
          <button onClick={onDuplicate} className="block w-full text-left px-3 py-1.5 hover:bg-black/[0.03]">
            Duplicate page
          </button>
          <button onClick={onMoveUp} className="block w-full text-left px-3 py-1.5 hover:bg-black/[0.03]">
            Move up
          </button>
          <button onClick={onMoveDown} className="block w-full text-left px-3 py-1.5 hover:bg-black/[0.03]">
            Move down
          </button>
          {canDelete && (
            <button onClick={onDelete} className="block w-full text-left px-3 py-1.5 hover:bg-black/[0.03]" style={{ color: "#B55139" }}>
              Delete page
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EffectPreview({ fx, color }: { fx: TextEffect; color: string }) {
  const base: React.CSSProperties = { fontFamily: "Fraunces, serif", fontStyle: "italic", fontWeight: 600, fontSize: 18, lineHeight: 1, color: "#16302B" };
  const style: React.CSSProperties =
    fx === "shadow"
      ? { ...base, textShadow: `2px 2px 0 ${color}` }
      : fx === "outline"
        ? { ...base, color: "#fff", WebkitTextStroke: `1px ${color}` }
        : fx === "glow"
          ? { ...base, color: "#fff", textShadow: `0 0 6px ${color}, 0 0 10px ${color}` }
          : fx === "background"
            ? { ...base, background: color, color: "#fff", padding: "0 4px", borderRadius: 3, fontSize: 16 }
            : fx === "curve"
              ? { ...base, color }
              : base;
  return <span style={style}>Ag</span>;
}

function AiToolRow({ title, desc, onClick, disabled }: { title: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl disabled:opacity-40 hover:bg-black/[0.03]" style={{ border: "1px solid var(--portal-line)" }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#FBF7EF", color: "var(--portal-gold)" }}>
        ✦
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-extrabold" style={{ color: "#16302B" }}>
          {title}
        </span>
        <span className="block text-[11px]" style={{ color: DIM }}>
          {desc}
        </span>
      </span>
    </button>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  return (
    <label className="flex items-center gap-1 rounded-lg px-1.5" style={{ border: "1px solid var(--portal-line)" }}>
      <span className="text-[10px] font-bold" style={{ color: DIM }}>
        {label}
      </span>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => !Number.isNaN(Number(draft)) && onChange(Number(draft))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="w-full min-w-0 text-xs py-1.5 outline-none" />
    </label>
  );
}

function GradientControls({ selected, updateSelected }: { selected: any; updateSelected: (p: any) => void }) {
  return (
    <div className="pt-2">
      <label className="flex items-center gap-2 text-xs mb-1.5 cursor-pointer">
        <input type="checkbox" checked={selected.gradient.enabled} onChange={(e) => updateSelected({ gradient: { ...selected.gradient, enabled: e.target.checked } })} />
        Gradient fill
      </label>
      {selected.gradient.enabled && (
        <div className="flex items-center gap-2">
          <input type="color" value={selected.gradient.from} onChange={(e) => updateSelected({ gradient: { ...selected.gradient, from: e.target.value } })} className="w-6 h-6 rounded-full cursor-pointer" />
          <input type="color" value={selected.gradient.to} onChange={(e) => updateSelected({ gradient: { ...selected.gradient, to: e.target.value } })} className="w-6 h-6 rounded-full cursor-pointer" />
          <select value={selected.gradient.direction} onChange={(e) => updateSelected({ gradient: { ...selected.gradient, direction: e.target.value } })} className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={{ border: "1px solid var(--portal-line)" }}>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="diagonal">Diagonal</option>
          </select>
        </div>
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

function FloatingToolbar({
  el,
  multi,
  grouped,
  onDuplicate,
  onDelete,
  onAlign,
  onReorder,
  onEdit,
  onCrop,
  onGroup,
  onUngroup,
  onLock,
}: {
  el: FlierElement;
  multi: boolean;
  grouped: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onAlign: (pos: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void;
  onReorder: (dir: "front" | "back" | "forward" | "backward") => void;
  onEdit: () => void;
  onCrop: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onLock: () => void;
}) {
  const [open, setOpen] = useState<"align" | "layer" | null>(null);
  return (
    <div className="relative">
      <div className="flex items-center gap-0.5 rounded-full px-1.5 py-1.5" style={{ background: "#1F2A24", boxShadow: "0 6px 20px rgba(0,0,0,0.28)" }} onMouseLeave={() => setOpen(null)}>
        {el.type === "image" && !multi && (
          <>
            <DarkIconBtn onClick={onEdit} title="Edit image">
              <Icon.Effects />
            </DarkIconBtn>
            <DarkTextBtn onClick={onCrop} title="Crop & reposition">
              Crop
            </DarkTextBtn>
            <div className="w-px h-5 mx-0.5" style={{ background: "rgba(255,255,255,0.15)" }} />
          </>
        )}
        {multi && (
          <>
            <DarkTextBtn onClick={grouped ? onUngroup : onGroup} title={grouped ? "Ungroup (Ctrl+Shift+G)" : "Group (Ctrl+G)"}>
              {grouped ? "Ungroup" : "Group"}
            </DarkTextBtn>
            <div className="w-px h-5 mx-0.5" style={{ background: "rgba(255,255,255,0.15)" }} />
          </>
        )}
        <DarkIconBtn onClick={onDuplicate} title="Duplicate (Ctrl+D)"><Icon.Duplicate /></DarkIconBtn>
        <DarkIconBtn onClick={onDelete} title="Delete"><Icon.Delete /></DarkIconBtn>
        <DarkTextBtn onClick={onLock} title="Lock (Ctrl+L)">
          🔒
        </DarkTextBtn>
        <div className="w-px h-5 mx-0.5" style={{ background: "rgba(255,255,255,0.15)" }} />
        <DarkIconBtn onClick={() => setOpen(open === "align" ? null : "align")} title="Align" active={open === "align"}>
          <Icon.AlignCenterH />
        </DarkIconBtn>
        {!multi && (
          <DarkIconBtn onClick={() => setOpen(open === "layer" ? null : "layer")} title="Layer order" active={open === "layer"}>
            <Icon.BringFront />
          </DarkIconBtn>
        )}
      </div>
      {open === "align" && (
        <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full px-1.5 py-1.5 z-10" style={{ background: "#1F2A24", boxShadow: "0 6px 20px rgba(0,0,0,0.28)" }}>
          <DarkIconBtn onClick={() => onAlign("left")} title="Align left"><Icon.AlignLeft /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("hcenter")} title="Align center"><Icon.AlignCenterH /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("right")} title="Align right"><Icon.AlignRight /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("top")} title="Align top"><Icon.AlignTop /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("vcenter")} title="Align middle"><Icon.AlignCenterV /></DarkIconBtn>
          <DarkIconBtn onClick={() => onAlign("bottom")} title="Align bottom"><Icon.AlignBottom /></DarkIconBtn>
        </div>
      )}
      {open === "layer" && (
        <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full px-1.5 py-1.5 z-10" style={{ background: "#1F2A24", boxShadow: "0 6px 20px rgba(0,0,0,0.28)" }}>
          <DarkIconBtn onClick={() => onReorder("front")} title="Bring to front"><Icon.BringFront /></DarkIconBtn>
          <DarkIconBtn onClick={() => onReorder("forward")} title="Bring forward"><Icon.BringForward /></DarkIconBtn>
          <DarkIconBtn onClick={() => onReorder("backward")} title="Send backward"><Icon.SendBackward /></DarkIconBtn>
          <DarkIconBtn onClick={() => onReorder("back")} title="Send to back"><Icon.SendBack /></DarkIconBtn>
        </div>
      )}
    </div>
  );
}

function DarkIconBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button onClick={onClick} title={title} className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors duration-100" style={{ color: "#fff", background: active ? "rgba(255,255,255,0.18)" : "transparent" }} onMouseEnter={(e) => !active && (e.currentTarget.style.background = "rgba(255,255,255,0.1)")} onMouseLeave={(e) => !active && (e.currentTarget.style.background = "transparent")}>
      <span style={{ width: 15, height: 15, display: "inline-block" }}>{children}</span>
    </button>
  );
}
function DarkTextBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="h-9 px-2.5 rounded-full text-[11px] font-bold cursor-pointer" style={{ color: "#fff" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      {children}
    </button>
  );
}

function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-end lg:items-center justify-center lg:p-4 z-50" style={{ background: "rgba(22,48,43,0.5)" }} onClick={onClose}>
      <div className="bg-white p-5 w-full rounded-t-3xl max-h-[75vh] overflow-y-auto lg:max-w-sm lg:rounded-2xl lg:max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
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

function CategoryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl cursor-pointer transition-colors" style={{ background: "#F7FAF8", border: "1px solid var(--portal-line)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#EEF4F0")} onMouseLeave={(e) => (e.currentTarget.style.background = "#F7FAF8")}>
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

function IconBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none hover:scale-110 active:scale-95 hover:shadow-md transition-all duration-150" style={{ color: "var(--portal-emerald)", background: "transparent" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#EAF5EE")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ width: 16, height: 16, display: "inline-block" }}>{children}</span>
    </button>
  );
}

function RailBtn({ onClick, label, icon, color, active = false, title }: { onClick: () => void; label: string; icon: React.ReactNode; color: string; active?: boolean; title?: string }) {
  return (
    <button onClick={onClick} title={title ?? `Add ${label}`} className="flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-2xl cursor-pointer hover:scale-110 active:scale-95 transition-all duration-150 group flex-shrink-0" style={{ background: active ? "#EAF2ED" : "transparent" }}>
      <span className="flex items-center justify-center rounded-2xl transition-shadow duration-150 group-hover:shadow-md" style={{ width: 40, height: 40, background: `${color}22`, color }}>
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
    <button onClick={onClick} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 mb-1.5 mx-0.5 rounded-full cursor-pointer transition-all duration-150" style={{ color: active ? "#fff" : "#4F6B5B", background: active ? "var(--portal-emerald)" : "transparent" }}>
      <span style={{ width: 13, height: 13 }}>{icon}</span>
      {label}
    </button>
  );
}

function ToggleIconBtn({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex-1 flex items-center justify-center py-2 rounded-lg cursor-pointer transition-all duration-150 hover:scale-105 active:scale-95" style={{ background: active ? "var(--portal-emerald)" : "transparent", color: active ? "white" : "#555" }}>
      <span style={{ width: 14, height: 14 }}>{icon}</span>
    </button>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex-1 text-xs font-bold py-2 rounded-full cursor-pointer capitalize transition-all duration-150 hover:scale-105 active:scale-95" style={{ color: active ? "white" : "#5F7A6D", background: active ? "var(--portal-emerald)" : "#F0F4F1", boxShadow: active ? "0 3px 8px rgba(31,111,84,0.3)" : "none" }}>
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

function ColorSwatchRow({ value, onChange, compact }: { value: string; onChange: (c: string) => void; compact?: boolean }) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {BRAND_COLORS.map((c) => (
        <button key={c} onClick={() => onChange(c)} className={`${compact ? "w-5 h-5" : "w-6 h-6"} rounded-full cursor-pointer flex-shrink-0 transition-transform hover:scale-110`} style={{ background: c, border: value.toUpperCase() === c.toUpperCase() ? "2px solid var(--portal-gold)" : "1px solid var(--portal-line)" }} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className={`${compact ? "w-5 h-5" : "w-6 h-6"} rounded-full cursor-pointer flex-shrink-0`} title="Custom color" />
    </div>
  );
}

function SliderRow({ label, min, max, step, value, onChange, onCommit }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  return (
    <div className="flex gap-2 items-center mb-1">
      <label className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
        {label}
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))} onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))} className="flex-1" style={{ accentColor: "var(--portal-emerald)" }} />
      <span className="text-[10px] w-8 text-right flex-shrink-0" style={{ color: DIM }}>
        {Math.round(value * 100) / 100}
      </span>
    </div>
  );
}

function BorderShadowOpacityControls({ selected, updateSelected, bare = false }: { selected: any; updateSelected: (patch: any, commit?: boolean) => void; bare?: boolean }) {
  return (
    <div className="space-y-2">
      {!bare && <PanelLabel>Border &amp; shadow</PanelLabel>}
      <div className="flex gap-2 items-center">
        <label className="text-[10px] w-14 flex-shrink-0" style={{ color: DIM }}>
          Border
        </label>
        <input type="range" min={0} max={12} value={selected.borderWidth} onChange={(e) => updateSelected({ borderWidth: Number(e.target.value) }, false)} onMouseUp={(e) => updateSelected({ borderWidth: Number((e.target as HTMLInputElement).value) })} className="flex-1" style={{ accentColor: "var(--portal-emerald)" }} />
        <input type="color" value={selected.borderColor} onChange={(e) => updateSelected({ borderColor: e.target.value })} className="w-6 h-6 rounded-full cursor-pointer flex-shrink-0" />
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={selected.shadow} onChange={(e) => updateSelected({ shadow: e.target.checked })} />
        Drop shadow
      </label>
      <PanelDivider />
      <SliderRow label="Opacity" min={0} max={1} step={0.05} value={selected.opacity ?? 1} onChange={(v) => updateSelected({ opacity: v }, false)} onCommit={(v) => updateSelected({ opacity: v })} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Editor shell controls
// ---------------------------------------------------------------------
function FlatIconBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/[0.05] disabled:opacity-30 disabled:hover:bg-transparent" style={{ color: INK }}>
      <span style={{ width: 16, height: 16, display: "inline-block" }}>{children}</span>
    </button>
  );
}

function CtxBtn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active: boolean; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-pressed={active} className="h-[30px] min-w-[30px] px-2.5 rounded-md font-semibold flex-shrink-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:bg-black/[0.04]" style={active ? { background: "#E8F4EE", color: "#1F6F54", fontWeight: 700 } : { color: INK }}>
      {children}
    </button>
  );
}

function CtxIconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="w-[30px] h-[30px] rounded-md flex items-center justify-center flex-shrink-0 hover:bg-black/[0.04]" style={{ color: danger ? "#B55139" : INK }}>
      <span style={{ width: 15, height: 15, display: "inline-block" }}>{children}</span>
    </button>
  );
}

function CtxDivider() {
  return <span aria-hidden className="flex-shrink-0" style={{ width: 1, height: 22, background: LINE }} />;
}

/** Dropdown under a context-bar button. Rendered fixed so the bar's horizontal scroll can't clip it. */
function CtxMenu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    const onClose = () => closeRef.current();
    const anchor = ref.current?.parentElement;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div ref={ref} role="menu" className="fixed z-[55] rounded-xl py-1.5 min-w-[180px]" style={{ top: pos?.top ?? -9999, right: pos?.right ?? 0, background: "#fff", border: `1px solid ${LINE}`, boxShadow: "0 12px 30px rgba(22,48,43,0.18)" }}>
      {children}
    </div>
  );
}

function CtxMenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-left hover:bg-black/[0.04]" style={{ color: INK }}>
      <span style={{ width: 14, height: 14, display: "inline-block", color: MUTED }}>{icon}</span>
      {label}
    </button>
  );
}
