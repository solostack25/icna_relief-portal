"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  type FlierElement,
  BRAND_FONTS,
  BRAND_COLORS,
  newTextElement,
  newImageElement,
  newRectElement,
} from "@/lib/flierElements";
import ApprovedImagePicker from "../../ApprovedImagePicker";

const FlierCanvas = dynamic(() => import("@/components/FlierCanvas"), { ssr: false });

const CANVAS_SCALE = 0.42;

export default function BuilderClient({ template }: { template: any }) {
  const supabase = createClient();

  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category ?? "");
  const [elements, setElements] = useState<FlierElement[]>(template.canvas_data ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  function addElement(el: FlierElement) {
    setElements([...elements, el]);
    setSelectedId(el.id);
  }
  function updateSelected(patch: Partial<FlierElement>) {
    if (!selected) return;
    setElements(elements.map((e) => (e.id === selected.id ? ({ ...e, ...patch } as FlierElement) : e)));
  }
  function deleteSelected() {
    if (!selected) return;
    setElements(elements.filter((e) => e.id !== selected.id));
    setSelectedId(null);
  }

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
        canvas_data: elements,
        editable_element_ids,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mt-4 mb-4">
        <div className="flex items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-bold bg-transparent border-none outline-none"
            style={{ minWidth: 200 }}
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
            className="text-sm px-2 py-1 rounded"
            style={{ border: "1px solid var(--portal-line)" }}
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

      <div className="flex gap-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-2 w-32 flex-shrink-0">
          <button
            onClick={() => addElement(newTextElement())}
            className="text-xs px-3 py-2 rounded-lg cursor-pointer text-left"
            style={{ border: "1px solid var(--portal-line)", background: "white" }}
          >
            + Text
          </button>
          <button
            onClick={() => addElement(newImageElement())}
            className="text-xs px-3 py-2 rounded-lg cursor-pointer text-left"
            style={{ border: "1px solid var(--portal-line)", background: "white" }}
          >
            + Image
          </button>
          <button
            onClick={() => addElement(newRectElement())}
            className="text-xs px-3 py-2 rounded-lg cursor-pointer text-left"
            style={{ border: "1px solid var(--portal-line)", background: "white" }}
          >
            + Rectangle
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-shrink-0" style={{ border: "1px solid var(--portal-line)", borderRadius: 8, overflow: "hidden" }}>
          <FlierCanvas
            width={template.canvas_width}
            height={template.canvas_height}
            elements={elements}
            mode="builder"
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={setElements}
            scale={CANVAS_SCALE}
          />
        </div>

        {/* Properties panel */}
        <div className="flex-1 min-w-[220px]">
          {!selected ? (
            <p className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
              Select an element on the canvas to edit it, or add a new one from the toolbar.
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
                    onChange={(e) => updateSelected({ text: e.target.value })}
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
                </>
              )}

              {selected.type === "rect" && (
                <div className="flex gap-1.5 flex-wrap">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSelected({ fill: c })}
                      className="w-6 h-6 rounded-full cursor-pointer"
                      style={{ background: c, border: (selected as any).fill === c ? "2px solid var(--portal-gold)" : "1px solid var(--portal-line)" }}
                    />
                  ))}
                </div>
              )}

              {selected.type !== "rect" && (
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
                      onChange={(e) => updateSelected({ editableLabel: e.target.value } as any)}
                      placeholder="Field label (e.g. Event Title)"
                      className="w-full rounded-lg px-2 py-1.5 text-xs"
                      style={{ border: "1px solid var(--portal-line)" }}
                    />
                  )}
                </div>
              )}

              <button
                onClick={deleteSelected}
                className="text-xs cursor-pointer pt-1"
                style={{ color: "#B55139" }}
              >
                Delete Element
              </button>
            </div>
          )}
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
