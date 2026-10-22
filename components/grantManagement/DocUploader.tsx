"use client";

import { useRef, useState } from "react";
import { DOC_TYPE_LABELS, money } from "@/lib/grantManagement/shared";
import { dim, emerald, faint, ink, rose, selectStyle } from "./ui";

export type Extract = { vendor: string | null; total: number | null; date: string | null; description: string | null; confidence: "high" | "medium" | "low" } | null;
export type Doc = { id: string; file_name: string; doc_type: string; content_type?: string | null; extracted?: Extract };

// Shrink big phone photos before upload (faster on cell data).
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function DocUploader({
  docs,
  onAdded,
  onRemove,
  expenseId,
  canRemove = true,
  prominent,
}: {
  docs: Doc[];
  onAdded: (d: Doc) => void;
  onRemove?: (id: string) => void;
  expenseId?: string;
  canRemove?: boolean;
  prominent?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("receipt");
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setErr(null);
    for (const file of Array.from(list).slice(0, 10)) {
      setBusy((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", await shrink(file), file.type.startsWith("image/") ? "photo.jpg" : file.name);
        fd.append("file_name", file.name);
        fd.append("doc_type", docType);
        if (expenseId) fd.append("expense_id", expenseId);
        const res = await fetch("/api/grant-management/documents", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed");
        onAdded({ id: body.id, file_name: file.name, doc_type: body.doc_type, content_type: body.content_type, extracted: body.extracted });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (camera.current) camera.current.value = "";
    if (files.current) files.current.value = "";
  }

  async function remove(id: string) {
    if (!confirm("Remove this document?")) return;
    const res = await fetch(`/api/grant-management/documents/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(body.error ?? "Couldn't remove it");
    onRemove?.(id);
  }

  return (
    <div className="rounded-2xl p-4" style={prominent ? { border: `1.5px dashed ${emerald}77`, background: "rgba(31,111,84,0.05)" } : { border: "1px solid var(--portal-line)", background: "#fff" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[180px] flex-1">
          <div className="text-[15px] font-bold" style={{ color: ink }}>
            📷 Receipts & supporting documents
          </div>
          <div className="text-xs mt-0.5" style={{ color: dim }}>
            Snap a receipt and we&apos;ll fill in the vendor, date and amount. PDFs, invoices, POs and contracts work too.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ ...selectStyle, width: "auto", padding: "8px 10px", fontSize: 13 }} aria-label="Document type">
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => camera.current?.click()} className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: emerald, color: "#fff" }}>
            Take photo
          </button>
          <button type="button" onClick={() => files.current?.click()} className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "#fff", color: ink, border: "1.5px solid var(--portal-line)" }}>
            Upload file
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
          <input ref={files} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>
      {(docs.length > 0 || busy > 0) && (
        <div className="grid gap-1.5 mt-3">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 bg-white" style={{ border: "1px solid rgba(22,48,43,0.08)" }}>
              <a href={`/api/grant-management/documents/${d.id}`} target="_blank" rel="noreferrer" className="min-w-0 text-sm">
                <span className="font-semibold hover:underline" style={{ color: ink }}>
                  {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                </span>{" "}
                <span style={{ color: faint }}>· {d.file_name}</span>
                {d.extracted && (d.extracted.vendor || d.extracted.total) && (
                  <span className="block text-xs" style={{ color: dim }}>
                    Read: {[d.extracted.vendor, d.extracted.total != null ? money(d.extracted.total, true) : null, d.extracted.date].filter(Boolean).join(" · ")}
                    {d.extracted.confidence === "low" ? " (hard to read, please check)" : ""}
                  </span>
                )}
              </a>
              {canRemove && onRemove && (
                <button type="button" onClick={() => remove(d.id)} className="text-lg leading-none" style={{ color: rose }} title="Remove">
                  ×
                </button>
              )}
            </div>
          ))}
          {busy > 0 && (
            <div className="text-xs" style={{ color: dim }}>
              Uploading{busy > 1 ? ` ${busy} files` : ""} and reading…
            </div>
          )}
        </div>
      )}
      {err && (
        <div className="text-xs font-semibold mt-2" style={{ color: rose }}>
          {err}
        </div>
      )}
    </div>
  );
}
