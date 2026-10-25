"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { LayoutItem } from "./homeLayout";

export type SheetTab = "quick" | "programs";

export type SheetRowMeta = {
  label: string;
  desc?: string;
  icon?: React.ReactNode;
  tint?: string;
  iconColor?: string;
};

export default function CustomizeHomeSheet({
  open,
  initialTab,
  quick,
  programs,
  quickMeta,
  programMeta,
  quickDefaults,
  programDefaults,
  showProgramsTab,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  initialTab: SheetTab;
  quick: LayoutItem[];
  programs: LayoutItem[];
  quickMeta: Record<string, SheetRowMeta>;
  programMeta: Record<string, SheetRowMeta>;
  quickDefaults: LayoutItem[];
  programDefaults: LayoutItem[];
  showProgramsTab: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (quick: LayoutItem[], programs: LayoutItem[]) => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [draftQuick, setDraftQuick] = useState(quick);
  const [draftPrograms, setDraftPrograms] = useState(programs);

  // Start from the live layout every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTab(showProgramsTab ? initialTab : "quick");
    setDraftQuick(quick);
    setDraftPrograms(programs);
  }, [open, initialTab, quick, programs, showProgramsTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const items = tab === "quick" ? draftQuick : draftPrograms;
  const setItems = tab === "quick" ? setDraftQuick : setDraftPrograms;
  const meta = tab === "quick" ? quickMeta : programMeta;
  const shownCount = items.filter((i) => i.visible).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={t("selectApp.customize.title")}>
      <button
        type="button"
        aria-label={t("selectApp.customize.cancel")}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(22,48,43,0.45)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: "var(--portal-sand)", boxShadow: "0 20px 60px rgba(22,48,43,0.25)" }}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--portal-line)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                className="m-0"
                style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, color: "var(--portal-ink)" }}
              >
                {t("selectApp.customize.title")}
              </h2>
              <p className="text-xs mt-1 mb-0" style={{ color: "rgba(22,48,43,0.6)" }}>
                {t("selectApp.customize.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("selectApp.customize.cancel")}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "white", border: "1px solid var(--portal-line)" }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {showProgramsTab && (
            <div className="mt-4 inline-flex rounded-full p-1" style={{ background: "white", border: "1px solid var(--portal-line)" }}>
              {(["quick", "programs"] as SheetTab[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold transition-colors"
                  style={
                    tab === k
                      ? { background: "var(--portal-emerald)", color: "var(--portal-sand)" }
                      : { color: "var(--portal-ink)" }
                  }
                >
                  {k === "quick" ? t("selectApp.quickActions.title") : t("selectApp.yourPrograms.title")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs" style={{ color: "rgba(22,48,43,0.6)" }}>
              {t("selectApp.customize.dragHint")}
            </span>
            <span className="text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--portal-emerald)" }}>
              {t("selectApp.customize.shownCount", { shown: shownCount, total: items.length })}
            </span>
          </div>
          <SortableList items={items} setItems={setItems} meta={meta} />
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid var(--portal-line)", background: "white" }}>
          <button
            type="button"
            onClick={() => {
              setDraftQuick(quickDefaults);
              setDraftPrograms(programDefaults);
            }}
            className="text-xs font-semibold underline underline-offset-2"
            style={{ color: "rgba(22,48,43,0.7)" }}
          >
            {t("selectApp.customize.reset")}
          </button>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs" style={{ color: "#B42318" }}>{error}</span>}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-semibold"
              style={{ border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
            >
              {t("selectApp.customize.cancel")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(draftQuick, draftPrograms)}
              className="px-5 py-2 rounded-full text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--portal-emerald)", color: "var(--portal-sand)" }}
            >
              {saving ? t("selectApp.customize.saving") : t("selectApp.customize.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableList({
  items,
  setItems,
  meta,
}: {
  items: LayoutItem[];
  setItems: (fn: (prev: LayoutItem[]) => LayoutItem[]) => void;
  meta: Record<string, SheetRowMeta>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((i) => i.key === active.id);
      const to = prev.findIndex((i) => i.key === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  const toggle = (key: string) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, visible: !i.visible } : i)));

  const move = (key: string, dir: -1 | 1) =>
    setItems((prev) => {
      const from = prev.findIndex((i) => i.key === key);
      const to = from + dir;
      return to < 0 || to >= prev.length ? prev : arrayMove(prev, from, to);
    });

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {items.map((item, idx) => (
            <SortableRow
              key={item.key}
              item={item}
              meta={meta[item.key] ?? { label: item.key }}
              first={idx === 0}
              last={idx === items.length - 1}
              onToggle={() => toggle(item.key)}
              onMove={(d) => move(item.key, d)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  meta,
  first,
  last,
  onToggle,
  onMove,
}: {
  item: LayoutItem;
  meta: SheetRowMeta;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });

  return (
    <li
      ref={setNodeRef}
      className="flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2.5"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        border: "1px solid var(--portal-line)",
        boxShadow: isDragging ? "0 10px 24px rgba(22,48,43,0.18)" : "0 1px 2px rgba(22,48,43,0.04)",
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        opacity: item.visible ? 1 : 0.6,
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("selectApp.customize.dragLabel", { name: meta.label })}
        className="w-7 h-9 flex items-center justify-center rounded-md flex-shrink-0 touch-none"
        style={{ color: "rgba(22,48,43,0.4)", cursor: "grab" }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>

      {meta.icon ? (
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: meta.tint, color: meta.iconColor }}
        >
          <span style={{ width: 16, height: 16, display: "block" }}>{meta.icon}</span>
        </span>
      ) : (
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#EAF3EF" }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--portal-emerald)" }} />
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold leading-tight truncate">{meta.label}</div>
        {meta.desc && (
          <div className="text-[11px] leading-snug truncate" style={{ color: "rgba(22,48,43,0.55)" }}>
            {meta.desc}
          </div>
        )}
      </div>

      {/* Up/down for anyone who can't or won't drag */}
      <div className="hidden sm:flex flex-col">
        <button type="button" disabled={first} onClick={() => onMove(-1)} aria-label={t("selectApp.customize.moveUp")} className="w-6 h-4 flex items-center justify-center disabled:opacity-25" style={{ color: "rgba(22,48,43,0.55)" }}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 15l6-6 6 6" /></svg>
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)} aria-label={t("selectApp.customize.moveDown")} className="w-6 h-4 flex items-center justify-center disabled:opacity-25" style={{ color: "rgba(22,48,43,0.55)" }}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={item.visible}
        aria-label={t(item.visible ? "selectApp.customize.hideItem" : "selectApp.customize.showItem", { name: meta.label })}
        onClick={onToggle}
        className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors"
        style={{ background: item.visible ? "var(--portal-emerald)" : "rgba(22,48,43,0.18)" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
          style={{ insetInlineStart: item.visible ? 18 : 2, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
        />
      </button>
    </li>
  );
}
