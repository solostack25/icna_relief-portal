"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/app/inkind/components/Logo";
import StationOfficeBar, { useStationOffice } from "@/app/inkind/components/StationOffice";

type CatalogItem = { code: string; name: string; new_price: number; unit: string };
type Line = {
  key: string;
  description: string;
  weight_lbs: number | null;
  item_code: string;
  qty: string;
  confidence: "high" | "medium" | "low";
};
type Extracted = {
  food_bank_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_weight_lbs: number | null;
  lines: { description: string; weight_lbs: number | null; item_code: string | null; qty: number; confidence: Line["confidence"] }[];
  warnings: string[];
};
type Step = "capture" | "reading" | "review" | "saving" | "done";

const MAX_PAGES = 6;
let keySeq = 0;
const newKey = () => `l${++keySeq}`;

// Phone photos are 3–12 MB; shrink in the browser so a multi-page invoice
// stays under the hosting upload limit (~4.5 MB per request).
async function shrinkImage(file: File, maxSide = 2000, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality));
}

export default function FoodBankIntakePage() {
  const router = useRouter();
  const station = useStationOffice();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture");
  const [pages, setPages] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [scanId, setScanId] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [knownFoodBanks, setKnownFoodBanks] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [invoiceWeight, setInvoiceWeight] = useState<number | null>(null);

  const [foodBankName, setFoodBankName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [viewPage, setViewPage] = useState<number | null>(null);

  const [result, setResult] = useState<{
    invoiceId: string;
    totalValue: number;
    lineCount: number;
    salesforce: { success: boolean; summary: string };
  } | null>(null);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const byCode = useMemo(() => new Map(catalog.map((c) => [c.code, c])), [catalog]);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPages((prev) => [...prev, ...next].slice(0, MAX_PAGES));
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePage(i: number) {
    setPages((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function readInvoice() {
    if (!station.officeId) return setError("Choose this station's office first.");
    if (pages.length === 0) return setError("Take a photo of the invoice first.");
    setError(null);
    setStep("reading");
    try {
      const form = new FormData();
      form.append("officeId", station.officeId);
      for (const p of pages) form.append("images", await shrinkImage(p.file), "invoice.jpg");
      const res = await fetch("/api/inkind/food-bank/scan", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: `Upload failed (HTTP ${res.status})` }));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the invoice");

      const ex: Extracted = data.extracted;
      setScanId(data.scanId);
      setPaths(data.paths);
      setCatalog(data.catalog);
      setKnownFoodBanks(data.knownFoodBanks ?? []);
      setWarnings(ex.warnings ?? []);
      setInvoiceWeight(ex.total_weight_lbs);
      setFoodBankName((ex.food_bank_name && matchKnown(ex.food_bank_name, data.knownFoodBanks)) || ex.food_bank_name || data.knownFoodBanks?.[0] || "");
      setInvoiceNumber(ex.invoice_number ?? "");
      if (ex.invoice_date) setDateReceived(ex.invoice_date);
      setLines(
        ex.lines.map((l) => ({
          key: newKey(),
          description: l.description,
          weight_lbs: l.weight_lbs,
          item_code: l.item_code ?? "",
          qty: l.qty ? String(l.qty) : "",
          confidence: l.confidence,
        }))
      );
      if (ex.lines.length === 0) setWarnings((w) => [...w, "No food lines were found — add them below or retake the photo."]);
      setStep("review");
    } catch (err: any) {
      setError(err.message ?? "Couldn't read the invoice");
      setStep("capture");
    }
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch, confidence: patch.confidence ?? "high" } : l)));
  }

  const totals = useMemo(() => {
    let value = 0;
    let lbs = 0;
    for (const l of lines) {
      const item = byCode.get(l.item_code);
      const q = Number(l.qty);
      if (!item || !Number.isFinite(q) || q <= 0) continue;
      value += item.new_price * q;
      if (item.unit === "lb") lbs += q;
    }
    return { value, lbs };
  }, [lines, byCode]);

  const incomplete = lines.filter((l) => !l.item_code || !(Number(l.qty) > 0));
  const canSave = foodBankName.trim() && dateReceived && lines.length > 0 && incomplete.length === 0;

  async function save(allowDuplicate = false) {
    if (!canSave) return;
    setError(null);
    setStep("saving");
    try {
      const res = await fetch("/api/inkind/food-bank/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeId: station.officeId,
          scanId,
          paths,
          foodBankName,
          invoiceNumber,
          dateReceived,
          allowDuplicate,
          lines: lines.map((l) => ({ item_code: l.item_code, qty: Number(l.qty), description: l.description })),
        }),
      });
      const data = await res.json().catch(() => ({ error: `Save failed (HTTP ${res.status})` }));
      if (res.status === 409 && data.duplicate) {
        setDuplicate(true);
        throw new Error(data.error);
      }
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setResult(data);
      setStep("done");
    } catch (err: any) {
      setError(err.message ?? "Save failed");
      setStep("review");
    }
  }

  // ---------------------------------------------------------------- done
  if (step === "done" && result) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Logo className="h-9 w-auto mb-6" />
        <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center mb-6 text-3xl text-brand-dark">✓</div>
        <h1 className="text-2xl font-bold text-brand-dark mb-2">Food Bank Intake Saved</h1>
        <p className="text-gray-500 mb-1">
          {result.invoiceId} · {result.lineCount} items · ${result.totalValue.toFixed(2)}
        </p>
        {result.salesforce.success ? (
          <p className="text-sm text-brand-dark font-medium mb-8">Pushed to Salesforce with the invoice attached.</p>
        ) : (
          <div className="mb-8 max-w-md rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Saved, but the Salesforce push didn&apos;t go through — it&apos;s on the InKind dashboard to retry.
            <span className="block text-xs mt-1 opacity-80">{result.salesforce.summary}</span>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={() => window.location.reload()} className="rounded-xl bg-brand px-6 py-3 font-semibold text-white active:scale-95 transition">
            Scan Another Invoice
          </button>
          <button onClick={() => router.push("/inkind")} className="rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700">
            Home
          </button>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------- capture / reading
  if (step === "capture" || step === "reading") {
    return (
      <main className="min-h-screen p-6 max-w-2xl mx-auto">
        <Logo className="h-8 w-auto mb-4" />
        <h1 className="text-2xl font-bold text-brand-dark mb-1">Food Bank Delivery</h1>
        <p className="text-gray-500 text-sm mb-4">
          Take a photo of each page of the food bank&apos;s invoice. The portal reads the lines for you to check.
        </p>
        <div className="mb-6">
          <StationOfficeBar station={station} />
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addPhotos(e.target.files)} />

        {pages.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {pages.map((p, i) => (
              <div key={p.url} className="relative rounded-xl overflow-hidden border border-gray-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Invoice page ${i + 1}`} className="w-full h-36 object-cover" />
                <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white rounded px-1.5">p{i + 1}</span>
                {step === "capture" && (
                  <button onClick={() => removePage(i)} className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white text-sm" aria-label="Remove page">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {step === "reading" ? (
          <div className="rounded-2xl border-2 border-brand/30 bg-white p-8 text-center">
            <div className="mx-auto mb-3 h-10 w-10 rounded-full border-4 border-brand-light border-t-brand animate-spin" />
            <p className="font-semibold text-brand-dark">Reading the invoice…</p>
            <p className="text-xs text-gray-500 mt-1">Usually 10–30 seconds.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pages.length < MAX_PAGES && (
              <button
                onClick={() => fileRef.current?.click()}
                className="tap-target w-full rounded-2xl border-2 border-dashed border-brand/50 bg-white px-8 py-6 text-brand-dark font-semibold active:scale-95 transition"
              >
                {pages.length === 0 ? "📷 Take Photo of Invoice" : "📷 Add Another Page"}
              </button>
            )}
            <button
              onClick={readInvoice}
              disabled={pages.length === 0 || !station.office}
              className="tap-target w-full rounded-2xl bg-brand px-8 py-5 text-lg font-semibold text-white shadow-lg active:scale-95 transition disabled:opacity-40"
            >
              Read Invoice
            </button>
            <p className="text-xs text-gray-400 text-center">Lay the invoice flat, fill the frame, and avoid glare.</p>
          </div>
        )}

        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
        <button onClick={() => router.push("/inkind")} className="block mx-auto mt-6 text-sm text-gray-500 underline">
          Back
        </button>
      </main>
    );
  }

  // ---------------------------------------------------------------- review
  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto pb-32">
      <Logo className="h-8 w-auto mb-4" />
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Check the Invoice</h1>
          <p className="text-gray-500 text-sm">Fix anything the reader got wrong. Highlighted rows need a look.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {pages.map((p, i) => (
            <button key={p.url} onClick={() => setViewPage(i)} className="rounded-lg overflow-hidden border border-gray-200 w-12 h-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {viewPage !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={() => setViewPage(null)}>
          <div className="flex-1 overflow-auto p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pages[viewPage].url} alt="Invoice" className="mx-auto max-w-none w-[160%] sm:w-full" />
          </div>
          <p className="text-center text-white text-sm py-3">Tap to close</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          {warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="text-sm text-gray-600">
            <span className="text-red-500">*</span> Food Bank
          </label>
          <input
            list="known-food-banks"
            value={foodBankName}
            onChange={(e) => setFoodBankName(e.target.value)}
            placeholder="e.g. Houston Food Bank"
            className="w-full mt-1 rounded-lg border border-gray-300 p-3"
          />
          <datalist id="known-food-banks">
            {knownFoodBanks.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-sm text-gray-600">Food Bank Invoice #</label>
          <input
            value={invoiceNumber}
            onChange={(e) => {
              setInvoiceNumber(e.target.value);
              setDuplicate(false);
            }}
            className="w-full mt-1 rounded-lg border border-gray-300 p-3"
          />
        </div>
        <div>
          <label className="text-sm text-gray-600">
            <span className="text-red-500">*</span> Date Received
          </label>
          <input type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} className="w-full mt-1 rounded-lg border border-gray-300 p-3" />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {lines.map((l) => {
          const item = byCode.get(l.item_code);
          const q = Number(l.qty);
          const lineValue = item && q > 0 ? item.new_price * q : 0;
          const flagged = l.confidence === "low" || !l.item_code || !(q > 0);
          return (
            <div key={l.key} className={`p-3 ${flagged ? "bg-amber-50" : l.confidence === "medium" ? "bg-yellow-50/40" : ""}`}>
              <div className="flex items-start gap-2 mb-2">
                <input
                  value={l.description}
                  onChange={(e) => updateLine(l.key, { description: e.target.value })}
                  placeholder="As printed on the invoice"
                  className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700"
                />
                {l.weight_lbs != null && <span className="text-xs text-gray-400 whitespace-nowrap pt-2">{l.weight_lbs} lb on invoice</span>}
                <button onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-gray-400 hover:text-red-600 px-2 pt-1" aria-label="Remove line">
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <select
                  value={l.item_code}
                  onChange={(e) => updateLine(l.key, { item_code: e.target.value })}
                  className={`rounded-lg border p-2.5 text-sm bg-white ${l.item_code ? "border-gray-300" : "border-amber-400"}`}
                >
                  <option value="">Choose item…</option>
                  {catalog.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} — ${c.new_price.toFixed(2)}/{c.unit}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={l.qty}
                    onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                    className={`w-24 rounded-lg border p-2.5 text-sm text-right ${q > 0 ? "border-gray-300" : "border-amber-400"}`}
                  />
                  <span className="text-xs text-gray-500 w-12">{item?.unit ?? ""}</span>
                </div>
                <span className="text-sm font-semibold w-20 text-right">${lineValue.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
        <button
          onClick={() => setLines((prev) => [...prev, { key: newKey(), description: "", weight_lbs: null, item_code: "", qty: "", confidence: "high" }])}
          className="w-full p-3 text-sm font-semibold text-brand-dark hover:bg-gray-50"
        >
          + Add line
        </button>
      </div>

      {/* Sticky totals + save */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm">
            <p className="font-bold text-brand-dark text-lg">${totals.value.toFixed(2)}</p>
            <p className="text-gray-500">
              {lines.length} lines · {totals.lbs.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb
              {invoiceWeight != null && (
                <span className={Math.abs(invoiceWeight - totals.lbs) > Math.max(5, invoiceWeight * 0.02) ? " text-amber-700 font-medium" : ""}>
                  {" "}
                  (invoice total {invoiceWeight.toLocaleString()} lb)
                </span>
              )}
              {incomplete.length > 0 && <span className="text-amber-700 font-medium"> · {incomplete.length} need an item or quantity</span>}
            </p>
            {error && <p className="text-red-600 mt-1">{error}</p>}
          </div>
          {duplicate ? (
            <button onClick={() => save(true)} className="rounded-xl bg-amber-600 px-6 py-4 font-semibold text-white active:scale-95 transition">
              Save Anyway
            </button>
          ) : (
            <button
              onClick={() => save(false)}
              disabled={!canSave || step === "saving"}
              className="rounded-xl bg-brand px-6 py-4 font-semibold text-white active:scale-95 transition disabled:opacity-40"
            >
              {step === "saving" ? "Saving & pushing…" : "Save & Push to Salesforce"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function matchKnown(name: string, known: string[] | undefined): string | null {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  return known?.find((k) => {
    const kk = k.toLowerCase().replace(/[^a-z]/g, "");
    return kk.includes(n) || n.includes(kk);
  }) ?? null;
}
