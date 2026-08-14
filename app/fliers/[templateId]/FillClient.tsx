"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { FlierElement } from "@/lib/flierElements";
import ApprovedImagePicker from "../../marketing/fliers/ApprovedImagePicker";

const FlierCanvas = dynamic(() => import("@/components/FlierCanvas"), { ssr: false });

const CANVAS_SCALE = 0.42;

export default function FillClient({ template, folders }: { template: any; folders: { id: string; name: string }[] }) {
  const supabase = createClient();
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const [elements, setElements] = useState<FlierElement[]>(template.canvas_data ?? []);
  const [pickerForElementId, setPickerForElementId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState(folders[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const editableFields = elements.filter((e) => e.editable);

  function updateField(id: string, patch: Partial<FlierElement>) {
    setElements(elements.map((e) => (e.id === id ? ({ ...e, ...patch } as FlierElement) : e)));
  }

  async function logDownload() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
    if (employee) {
      await supabase.from("flier_downloads").insert({ template_id: template.id, employee_id: employee.id });
    }
  }

  function getCanvasDataUrl(): string | null {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/png") : null;
  }

  async function download() {
    const dataUrl = getCanvasDataUrl();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${template.name.replace(/\s+/g, "-")}.png`;
    a.click();
    logDownload();
  }

  async function saveToDropbox() {
    const dataUrl = getCanvasDataUrl();
    if (!dataUrl || !folderId) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const formData = new FormData();
      formData.append("folderId", folderId);
      formData.append("files", blob, `${template.name.replace(/\s+/g, "-")}-${Date.now()}.png`);
      const res = await fetch("/api/content-upload", { method: "POST", body: formData });
      const body = await res.json();
      const ok = body.results?.[0]?.ok;
      setSaveResult(ok ? "Saved to Dropbox ✓" : `Failed: ${body.results?.[0]?.error ?? "Unknown error"}`);
      if (ok) logDownload();
    } catch (e: any) {
      setSaveResult(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1
        style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "10px 0 20px" }}
      >
        {template.name}
      </h1>

      <div className="flex gap-6 flex-wrap">
        <div ref={canvasWrapRef} className="flex-shrink-0" style={{ border: "1px solid var(--portal-line)", borderRadius: 8, overflow: "hidden" }}>
          <FlierCanvas
            width={template.canvas_width}
            height={template.canvas_height}
            background={template.canvas_background}
            elements={elements}
            mode="fill"
            scale={CANVAS_SCALE}
          />
        </div>

        <div className="flex-1 min-w-[260px]">
          {editableFields.length === 0 ? (
            <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
              This template has no editable fields — just download it as-is.
            </p>
          ) : (
            <div className="space-y-3 mb-6">
              {editableFields.map((el) => (
                <div key={el.id}>
                  <label className="block text-xs font-medium mb-1">{(el as any).editableLabel ?? "Field"}</label>
                  {el.type === "text" && (
                    <textarea
                      value={el.text}
                      onChange={(e) => updateField(el.id, { text: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg px-3 py-2 text-sm"
                      style={{ border: "1px solid var(--portal-line)" }}
                    />
                  )}
                  {el.type === "image" && (
                    <button
                      onClick={() => setPickerForElementId(el.id)}
                      className="text-xs px-3 py-2 rounded-lg cursor-pointer w-full"
                      style={{ border: "1px solid var(--portal-line)" }}
                    >
                      {el.dropboxPath ? "Change Image" : "Choose Image"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={download}
            className="text-sm px-5 py-2.5 rounded-lg text-white font-medium cursor-pointer mb-3 w-full"
            style={{ background: "var(--portal-emerald)" }}
          >
            Download PNG
          </button>

          {folders.length > 0 && (
            <div className="rounded-xl bg-white p-3" style={{ border: "1px solid var(--portal-line)" }}>
              <label className="block text-xs font-medium mb-1.5">Or save straight to Dropbox</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5 text-sm mb-2"
                style={{ border: "1px solid var(--portal-line)" }}
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                onClick={saveToDropbox}
                disabled={saving}
                className="text-xs px-3 py-2 rounded-lg cursor-pointer w-full disabled:opacity-50"
                style={{ border: "1px solid var(--portal-emerald)", color: "var(--portal-emerald)" }}
              >
                {saving ? "Saving…" : "Save to Dropbox"}
              </button>
              {saveResult && (
                <p className="text-xs mt-2" style={{ color: saveResult.startsWith("Saved") ? "var(--portal-emerald)" : "#B55139" }}>
                  {saveResult}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {pickerForElementId && (
        <ApprovedImagePicker
          onClose={() => setPickerForElementId(null)}
          onSelect={(img) => {
            updateField(pickerForElementId, { dropboxPath: img.dropbox_path, imageUrl: img.link } as any);
            setPickerForElementId(null);
          }}
        />
      )}
    </div>
  );
}
