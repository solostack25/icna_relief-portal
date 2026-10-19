"use client";

import { useRef, useState } from "react";

export type ReceiptExtract = {
  vendor: string | null;
  total: number | null;
  date: string | null;
  description: string | null;
  kind: "purchase" | "utility" | "vendor_invoice" | "unknown";
  confidence: "high" | "medium" | "low";
};
export type CapturedReceipt = { path: string; previewUrl: string | null; extracted: ReceiptExtract | null; readError?: string | null };

type Item = { key: string; local: string; status: "reading" | "done" | "error"; result?: CapturedReceipt; error?: string };

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shrink big phone photos before upload (faster on cell data). Falls back
// to the original file if the browser can't decode it.
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
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

export default function ReceiptCapture({ onReceipt }: { onReceipt: (r: CapturedReceipt) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files).slice(0, 10)) {
      const key = Math.random().toString(36).slice(2);
      const local = URL.createObjectURL(file);
      setItems((xs) => [...xs, { key, local, status: "reading" }]);
      try {
        const fd = new FormData();
        fd.append("file", await shrink(file), "receipt.jpg");
        const res = await fetch("/api/finance-tickets/receipts", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed");
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, status: "done", result: body } : x)));
        onReceipt(body);
      } catch (e) {
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, status: "error", error: e instanceof Error ? e.message : "Upload failed" } : x)));
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div style={{ border: "1.5px dashed rgba(31,111,84,0.45)", background: "rgba(31,111,84,0.05)", borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ minWidth: 200, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#16302B" }}>📷 Have a receipt?</div>
          <div style={{ fontSize: 13, color: "rgba(22,48,43,0.65)", marginTop: 2 }}>Snap a photo and we&apos;ll fill in the vendor, amount and date. The photo is attached for your approver.</div>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          style={{ background: "#1F6F54", color: "#fff", border: 0, borderRadius: 999, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          {items.length ? "Add another receipt" : "Snap or upload receipt"}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => handle(e.target.files)} />
      </div>

      {items.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {items.map((it) => {
            const ex = it.result?.extracted;
            const read = ex && (ex.vendor || ex.total);
            return (
              <div key={it.key} style={{ display: "flex", gap: 10, alignItems: "center", background: "#fff", borderRadius: 12, padding: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.local} alt="Receipt" style={{ width: 44, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(22,48,43,0.1)" }} />
                <div style={{ fontSize: 13, minWidth: 0 }}>
                  {it.status === "reading" && <span style={{ color: "rgba(22,48,43,0.6)" }}>Reading receipt…</span>}
                  {it.status === "error" && <span style={{ color: "#B42318" }}>{it.error}</span>}
                  {it.status === "done" && read && (
                    <>
                      <div style={{ fontWeight: 600 }}>
                        {[ex.vendor, ex.total != null ? money(ex.total) : null].filter(Boolean).join(" · ")}
                      </div>
                      <div style={{ color: "rgba(22,48,43,0.6)" }}>
                        {[ex.date ? new Date(ex.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null, ex.description].filter(Boolean).join(" · ")}
                        {ex.confidence === "low" ? " · hard to read, please check" : ""}
                      </div>
                    </>
                  )}
                  {it.status === "done" && !read && (
                    <span style={{ color: "rgba(22,48,43,0.6)" }}>
                      Attached. {it.result?.readError ? "Couldn't read it automatically" : "Couldn't make out the details"}, so please fill them in below.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {items.some((i) => i.status === "done") && (
            <div style={{ fontSize: 12, color: "rgba(22,48,43,0.6)" }}>Filled in below. Give it a quick check before you submit.</div>
          )}
        </div>
      )}
    </div>
  );
}
