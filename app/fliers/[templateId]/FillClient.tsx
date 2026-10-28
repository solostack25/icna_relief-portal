"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type Konva from "konva";
import { createClient } from "@/lib/supabase/client";
import { type FlierElement, type FlierPage, PRINT_PRESETS, pagesFromTemplate } from "@/lib/flierElements";
import { exportPagesAsImages, exportPagesAsPdf, downloadDataUrl, slug, waitForAssets } from "@/lib/flierExport";
import ApprovedImagePicker from "../../admin/fliers/ApprovedImagePicker";

const FlierCanvas = dynamic(() => import("@/components/FlierCanvas"), { ssr: false });

// Field-office Fill tool. Offices can only change the elements marketing
// marked editable; everything else is locked. Builder 2.0 adds pages,
// hi-res PNG and print PDF - the same exporter the Builder uses.
export default function FillClient({ template, folders }: { template: any; folders: { id: string; name: string }[] }) {
  const supabase = createClient();
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef<Record<number, Konva.Stage | null>>({});

  const [pages, setPages] = useState<FlierPage[]>(() => pagesFromTemplate(template));
  const [pageIndex, setPageIndex] = useState(0);
  const [pickerFor, setPickerFor] = useState<{ pageIndex: number; id: string } | null>(null);
  const [folderId, setFolderId] = useState(folders[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [quality, setQuality] = useState<"web" | "print">("print");
  const [paperId, setPaperId] = useState("letter");
  const [busy, setBusy] = useState<string | null>(null);
  const [scale, setScale] = useState(0.42);
  const wrapRef = useRef<HTMLDivElement>(null);

  const W = template.canvas_width as number;
  const H = template.canvas_height as number;
  const page = pages[pageIndex];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.2, Math.min(0.6, (el.clientWidth - 24) / W)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  const editableFields = useMemo(() => pages.flatMap((p, pi) => p.elements.filter((e) => e.editable).map((e) => ({ pi, el: e }))), [pages]);

  function updateField(pi: number, id: string, patch: Partial<FlierElement>) {
    setPages((ps) => ps.map((p, i) => (i === pi ? { ...p, elements: p.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as FlierElement) : e)) } : p)));
  }

  async function logDownload() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
    if (employee) await supabase.from("flier_downloads").insert({ template_id: template.id, employee_id: employee.id });
  }

  const fileBase = slug(template.name);
  const pixelRatio = quality === "print" ? 3 : 1;
  const getStage = (i: number) => stageRefs.current[i] ?? null;

  async function downloadPng() {
    setBusy("Rendering…");
    try {
      await waitForAssets(pages);
      const files = await exportPagesAsImages(pages, getStage, { format: "png", pixelRatio, fileBase });
      for (const f of files) {
        downloadDataUrl(f.dataUrl, f.filename);
        await new Promise((r) => setTimeout(r, 250));
      }
      logDownload();
    } finally {
      setBusy(null);
    }
  }
  async function downloadPdf() {
    setBusy("Building PDF…");
    try {
      await waitForAssets(pages);
      const paper = PRINT_PRESETS.find((p) => p.id === paperId);
      const { filename, blob } = await exportPagesAsPdf(pages, W, H, getStage, { format: "pdf", pixelRatio: 3, paper: paper && paper.widthIn ? { widthIn: paper.widthIn, heightIn: paper.heightIn } : null, bleed: true, cropMarks: true, fileBase });
      downloadDataUrl(URL.createObjectURL(blob), filename);
      logDownload();
    } finally {
      setBusy(null);
    }
  }

  async function saveToDropbox() {
    if (!folderId) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await waitForAssets(pages);
      const files = await exportPagesAsImages(pages, getStage, { format: "png", pixelRatio, fileBase });
      const formData = new FormData();
      formData.append("folderId", folderId);
      for (const f of files) {
        const blob = await (await fetch(f.dataUrl)).blob();
        formData.append("files", blob, f.filename.replace(/\.png$/, `-${Date.now()}.png`));
      }
      const res = await fetch("/api/content-upload", { method: "POST", body: formData });
      const body = await res.json();
      const ok = body.results?.every((r: any) => r.ok);
      setSaveResult(ok ? "Saved to Dropbox ✓" : `Failed: ${body.results?.find((r: any) => !r.ok)?.error ?? "Unknown error"}`);
      if (ok) logDownload();
    } catch (e: any) {
      setSaveResult(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "10px 0 20px" }}>{template.name}</h1>

      {/* Hidden full-scale stages for export */}
      <div style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }} aria-hidden>
        {pages.map((p, i) => (
          <div key={p.id} style={{ marginBottom: 8 }}>
            <FlierCanvas width={W} height={H} background={p.background} elements={p.elements} mode="preview" scale={1} onStageReady={(s) => (stageRefs.current[i] = s)} />
          </div>
        ))}
      </div>

      <div className="flex gap-6 flex-wrap">
        <div ref={wrapRef} className="flex-shrink-0 w-full md:w-auto md:flex-1 md:max-w-[520px]">
          {pages.length > 1 && (
            <div className="flex gap-1.5 mb-2">
              {pages.map((p, i) => (
                <button key={p.id} onClick={() => setPageIndex(i)} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: i === pageIndex ? "var(--portal-emerald)" : "#fff", color: i === pageIndex ? "#fff" : "#16302B", border: "1px solid var(--portal-line)" }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div ref={canvasWrapRef} className="inline-block" style={{ border: "1px solid var(--portal-line)", borderRadius: 8, overflow: "hidden" }}>
            <FlierCanvas width={W} height={H} background={page.background} elements={page.elements} mode="fill" scale={scale} />
          </div>
        </div>

        <div className="flex-1 min-w-[260px]">
          {editableFields.length === 0 ? (
            <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
              This template has no editable fields — just download it as-is.
            </p>
          ) : (
            <div className="space-y-3 mb-6">
              {editableFields.map(({ pi, el }) => (
                <div key={el.id}>
                  <label className="block text-xs font-medium mb-1">
                    {(el as any).editableLabel ?? "Field"}
                    {pages.length > 1 && (
                      <span className="ml-1.5 text-[10px] font-bold" style={{ color: "rgba(22,48,43,0.4)" }}>
                        {pages[pi].name}
                      </span>
                    )}
                  </label>
                  {el.type === "text" && (
                    <textarea value={el.text} onFocus={() => setPageIndex(pi)} onChange={(e) => updateField(pi, el.id, { text: e.target.value })} rows={2} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--portal-line)" }} />
                  )}
                  {el.type === "image" && (
                    <button
                      onClick={() => {
                        setPageIndex(pi);
                        setPickerFor({ pageIndex: pi, id: el.id });
                      }}
                      className="text-xs px-3 py-2 rounded-lg cursor-pointer w-full"
                      style={{ border: "1px solid var(--portal-line)" }}
                    >
                      {el.imageUrl ? "Change Image" : "Choose Image"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl bg-white p-3 mb-3" style={{ border: "1px solid var(--portal-line)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold">Download</span>
              <div className="flex rounded-full overflow-hidden text-[11px] font-bold" style={{ border: "1px solid var(--portal-line)" }}>
                <button onClick={() => setQuality("web")} className="px-2.5 py-1" style={{ background: quality === "web" ? "var(--portal-emerald)" : "#fff", color: quality === "web" ? "#fff" : "#16302B" }}>
                  Web
                </button>
                <button onClick={() => setQuality("print")} className="px-2.5 py-1" style={{ background: quality === "print" ? "var(--portal-emerald)" : "#fff", color: quality === "print" ? "#fff" : "#16302B" }}>
                  Hi-res
                </button>
              </div>
            </div>
            <button onClick={downloadPng} disabled={!!busy} className="text-sm px-5 py-2.5 rounded-lg text-white font-medium cursor-pointer mb-2 w-full disabled:opacity-60" style={{ background: "var(--portal-emerald)" }}>
              {busy ?? `Download PNG${pages.length > 1 ? ` (${pages.length} pages)` : ""} · ${W * pixelRatio}×${H * pixelRatio}`}
            </button>
            <div className="flex gap-2">
              <select value={paperId} onChange={(e) => setPaperId(e.target.value)} className="flex-1 min-w-0 rounded-lg px-2 py-2 text-xs" style={{ border: "1px solid var(--portal-line)" }}>
                {PRINT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button onClick={downloadPdf} disabled={!!busy} className="text-xs px-3 py-2 rounded-lg font-bold cursor-pointer disabled:opacity-60 flex-shrink-0" style={{ border: "1px solid #16302B", color: "#16302B" }}>
                Print PDF
              </button>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(22,48,43,0.45)" }}>
              PDF is 300 DPI with ⅛" bleed and crop marks — send it straight to the print shop.
            </p>
          </div>

          {folders.length > 0 && (
            <div className="rounded-xl bg-white p-3" style={{ border: "1px solid var(--portal-line)" }}>
              <label className="block text-xs font-medium mb-1.5">Or save straight to Dropbox</label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-sm mb-2" style={{ border: "1px solid var(--portal-line)" }}>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button onClick={saveToDropbox} disabled={saving} className="text-xs px-3 py-2 rounded-lg cursor-pointer w-full disabled:opacity-50" style={{ border: "1px solid var(--portal-emerald)", color: "var(--portal-emerald)" }}>
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

      {pickerFor && (
        <ApprovedImagePicker
          onClose={() => setPickerFor(null)}
          onSelect={(img) => {
            updateField(pickerFor.pageIndex, pickerFor.id, { dropboxPath: img.dropbox_path, imageUrl: img.link, naturalWidth: undefined, naturalHeight: undefined } as any);
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}
