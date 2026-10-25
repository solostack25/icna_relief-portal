"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/app/inkind/components/Logo";
import StationOfficeBar, { useStationOffice } from "@/app/inkind/components/StationOffice";

type CatalogItem = { code: string; name: string; new_price: number; unit: string };
type Line = {
  key: string;
  description: string;
  section: string | null;
  weight_lbs: number | null;
  product_cost: number | null;
  maintenance_fee: number | null;
  item_code: string;
  qty: string;
  confidence: "high" | "medium" | "low";
  inkind: boolean;
};
type GrantCredit = { ref: string; label: string; amount: string; mapped: boolean };
type Profile = { id: string; name: string; inkind_rule: "all_lines" | "zero_cost_only"; track_charges: boolean; has_requestor: boolean };
type Extracted = {
  food_bank_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_weight_lbs: number | null;
  lines: {
    description: string;
    section: string | null;
    weight_lbs: number | null;
    product_cost: number | null;
    maintenance_fee: number | null;
    item_code: string | null;
    qty: number;
    confidence: Line["confidence"];
  }[];
  total_charges: number | null;
  grant_credits: { ref: string; label: string; amount: number }[];
  amount_owed: number | null;
  warnings: string[];
};
type Page = { url: string; blob: Blob };
type Step = "capture" | "reading" | "review" | "saving" | "done";
type Result = {
  invoiceId: string;
  totalValue: number;
  lineCount: number;
  salesforce: { success: boolean; summary: string } | null;
  charges: {
    amount_owed: number;
    grant_credits: { ref: string; amount: number; gm_expense_id?: string | null; gm_grant_code?: string | null; error?: string | null }[];
    finance_ticket_number?: string | null;
    ticket_error?: string | null;
  } | null;
  chargeWarnings: string[];
};

const MAX_PAGES = 6;
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
let keySeq = 0;
const newKey = () => `l${++keySeq}`;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Phone photos are 3–12 MB; shrink in the browser so a multi-page invoice
// stays under the hosting upload limit (~4.5 MB per request).
async function shrinkImage(file: Blob, maxSide = 2000, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality));
}

// pdf.js from the CDN (keeps it out of the bundle; only food bank PDFs need it).
async function loadPdfJs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib) return w.pdfjsLib;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the PDF reader"));
    document.head.appendChild(s);
  });
  w.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
  return w.pdfjsLib;
}

// A PDF invoice -> page images (for the AI + preview) and its text layer.
async function readPdf(file: File): Promise<{ pages: Page[]; text: string }> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: Page[] = [];
  let text = "";
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.5, 2000 / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.85));
    pages.push({ blob, url: URL.createObjectURL(blob) });
    const tc = await page.getTextContent();
    text += `\n--- page ${n} ---\n` + tc.items.map((i: any) => i.str + (i.hasEOL ? "\n" : " ")).join("");
  }
  return { pages, text };
}

export default function FoodBankIntakePage() {
  const router = useRouter();
  const station = useStationOffice();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture");
  const [pages, setPages] = useState<Page[]>([]);
  const [pdf, setPdf] = useState<{ file: File; text: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanId, setScanId] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [knownFoodBanks, setKnownFoodBanks] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [invoiceWeight, setInvoiceWeight] = useState<number | null>(null);

  const [foodBankName, setFoodBankName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([]);
  const [totalCharges, setTotalCharges] = useState("");
  const [amountOwed, setAmountOwed] = useState("");
  const [credits, setCredits] = useState<GrantCredit[]>([]);
  const [showPurchased, setShowPurchased] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [viewPage, setViewPage] = useState<number | null>(null);
  const [pushing, setPushing] = useState(true); // which button was pressed
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const byCode = useMemo(() => new Map(catalog.map((c) => [c.code, c])), [catalog]);
  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const zeroCostRule = profile?.inkind_rule === "zero_cost_only";
  const tracksCharges = !!profile?.track_charges;

  async function addFiles(files: FileList | null, input: HTMLInputElement | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    const pdfFile = list.find((f) => f.type === "application/pdf");
    try {
      if (pdfFile) {
        setPreparing(true);
        const { pages: rendered, text } = await readPdf(pdfFile);
        pages.forEach((p) => URL.revokeObjectURL(p.url));
        setPages(rendered);
        setPdf({ file: pdfFile, text });
      } else {
        if (pdf) {
          pages.forEach((p) => URL.revokeObjectURL(p.url));
          setPdf(null);
        }
        const next = list.filter((f) => f.type.startsWith("image/")).map((f) => ({ blob: f as Blob, url: URL.createObjectURL(f) }));
        setPages((prev) => [...(pdf ? [] : prev), ...next].slice(0, MAX_PAGES));
      }
    } catch (e: any) {
      setError(e.message ?? "Couldn't open that file");
    } finally {
      setPreparing(false);
      if (input) input.value = "";
    }
  }

  function removePage(i: number) {
    if (pdf) {
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      setPages([]);
      setPdf(null);
      return;
    }
    setPages((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function readInvoice() {
    if (!station.officeId) return setError("Choose this station's office first.");
    if (pages.length === 0) return setError("Add the invoice first.");
    setError(null);
    setStep("reading");
    try {
      const form = new FormData();
      form.append("officeId", station.officeId);
      for (const p of pages) form.append("images", pdf ? p.blob : await shrinkImage(p.blob), "invoice.jpg");
      if (pdf) {
        form.append("pdf", pdf.file, pdf.file.name || "invoice.pdf");
        form.append("pdfText", pdf.text);
      }
      const res = await fetch("/api/inkind/food-bank/scan", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: `Upload failed (HTTP ${res.status})` }));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the invoice");

      const ex: Extracted = data.extracted;
      const profs: Profile[] = data.profiles ?? [];
      const prof = profs.find((p) => p.id === data.profileId) ?? null;
      setScanId(data.scanId);
      setPaths(data.paths);
      setCatalog(data.catalog);
      setKnownFoodBanks(data.knownFoodBanks ?? []);
      setProfiles(profs);
      setProfileId(prof?.id ?? "");
      setWarnings(ex.warnings ?? []);
      setInvoiceWeight(ex.total_weight_lbs);
      setFoodBankName(prof?.name || (ex.food_bank_name && matchKnown(ex.food_bank_name, data.knownFoodBanks)) || ex.food_bank_name || data.knownFoodBanks?.[0] || "");
      setInvoiceNumber(ex.invoice_number ?? "");
      if (ex.invoice_date) setDateReceived(ex.invoice_date);
      const zero = prof?.inkind_rule === "zero_cost_only";
      setLines(
        ex.lines.map((l) => ({
          key: newKey(),
          description: l.description,
          section: l.section,
          weight_lbs: l.weight_lbs,
          product_cost: l.product_cost,
          maintenance_fee: l.maintenance_fee,
          item_code: l.item_code ?? "",
          qty: l.qty ? String(l.qty) : "",
          confidence: l.confidence,
          inkind: zero ? !(Number(l.product_cost) > 0) : true,
        }))
      );
      setTotalCharges(ex.total_charges != null ? String(ex.total_charges) : "");
      setAmountOwed(ex.amount_owed != null ? String(ex.amount_owed) : "");
      const status: { ref: string; mapped: boolean }[] = data.grantStatus ?? [];
      setCredits(ex.grant_credits.map((g, i) => ({ ref: g.ref, label: g.label, amount: String(g.amount), mapped: !!status[i]?.mapped })));
      if (ex.lines.length === 0) setWarnings((w) => [...w, "No lines were found — add them below or retake the photo."]);
      setStep("review");
    } catch (err: any) {
      setError(err.message ?? "Couldn't read the invoice");
      setStep("capture");
    }
  }

  // Switching the food bank rules re-applies the in-kind rule.
  function chooseProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (p) setFoodBankName(p.name);
    const zero = p?.inkind_rule === "zero_cost_only";
    setLines((prev) => prev.map((l) => ({ ...l, inkind: zero ? !(Number(l.product_cost) > 0) : true })));
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch, confidence: patch.item_code !== undefined || patch.qty !== undefined ? "high" : l.confidence } : l))
    );
  }

  const inkindLines = lines.filter((l) => l.inkind);
  const purchasedLines = lines.filter((l) => !l.inkind);

  const totals = useMemo(() => {
    let value = 0;
    let lbs = 0;
    for (const l of lines) {
      const item = byCode.get(l.item_code);
      const q = Number(l.qty);
      if (!l.inkind) {
        lbs += l.weight_lbs ?? 0;
        continue;
      }
      if (!item || !Number.isFinite(q) || q <= 0) continue;
      value += item.new_price * q;
      // Milk/eggs/meals are counted in their own unit; use the invoice's
      // printed pounds for them so the weight check still lines up.
      lbs += item.unit === "lb" ? q : l.weight_lbs ?? 0;
    }
    const purchased = purchasedLines.reduce((a, l) => a + (Number(l.product_cost) || 0), 0);
    return { value, lbs, purchased };
  }, [lines, byCode, purchasedLines]);

  const chargeCheck = useMemo(() => {
    const total = Number(totalCharges);
    const owed = Number(amountOwed) || 0;
    const granted = credits.reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const off = totalCharges !== "" && Number.isFinite(total) && Math.abs(granted + owed - total) > 0.01;
    return { granted, owed, off, total };
  }, [totalCharges, amountOwed, credits]);

  const incomplete = inkindLines.filter((l) => !l.item_code || !(Number(l.qty) > 0));
  const hasCharges = tracksCharges && (chargeCheck.owed > 0 || chargeCheck.granted > 0);
  const canSave = foodBankName.trim() && dateReceived && (inkindLines.length > 0 || hasCharges) && incomplete.length === 0;

  async function save(pushNow: boolean, allowDuplicate = false) {
    if (!canSave) return;
    setError(null);
    setPushing(pushNow);
    setStep("saving");
    try {
      const res = await fetch("/api/inkind/food-bank/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeId: station.officeId,
          scanId,
          paths,
          foodBankId: profileId || null,
          foodBankName,
          invoiceNumber,
          dateReceived,
          allowDuplicate,
          pushNow,
          lines: lines.map((l) => ({
            item_code: l.item_code,
            qty: Number(l.qty),
            description: l.description,
            inkind: l.inkind,
            product_cost: l.product_cost,
          })),
          charges: tracksCharges
            ? {
                total_charges: totalCharges === "" ? null : Number(totalCharges),
                amount_owed: Number(amountOwed) || 0,
                grant_credits: credits.map((c) => ({ ref: c.ref, label: c.label, amount: Number(c.amount) || 0 })),
              }
            : null,
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
    const c = result.charges;
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Logo className="h-9 w-auto mb-6" />
        <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center mb-6 text-3xl text-brand-dark">✓</div>
        <h1 className="text-2xl font-bold text-brand-dark mb-2">Food Bank Intake Saved</h1>
        <p className="text-gray-500 mb-3">
          {result.invoiceId} · {result.lineCount} in-kind items · {usd(result.totalValue)}
        </p>
        {!result.salesforce && !(c && (c.grant_credits.some((g) => g.gm_expense_id) || c.finance_ticket_number)) ? (
          <p className="text-sm text-gray-600 font-medium mb-8 max-w-md">
            Saved. It&apos;s on the InKind dashboard to review and push{c ? " — Salesforce and the charges go out from there" : " to Salesforce"}.
          </p>
        ) : (
          <div className="mb-8 max-w-md w-full space-y-2 text-sm text-left">
            {result.salesforce &&
              (result.salesforce.success ? (
                <p className="rounded-xl bg-brand-light/60 p-3 text-brand-dark">✓ In-kind pushed to Salesforce with the invoice attached.</p>
              ) : (
                <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800">
                  Salesforce push didn&apos;t go through — retry it from the InKind dashboard.
                  <span className="block text-xs mt-1 opacity-80">{result.salesforce.summary}</span>
                </p>
              ))}
            {c?.grant_credits.map((g, i) => (
              <p key={i} className={`rounded-xl p-3 ${g.gm_expense_id ? "bg-brand-light/60 text-brand-dark" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                {g.gm_expense_id ? `✓ ${usd(g.amount)} posted to grant ${g.gm_grant_code ?? g.ref} (approved).` : `Grant credit ${usd(g.amount)} (${g.ref}) is waiting: ${g.error ?? "not posted"}`}
              </p>
            ))}
            {c && c.amount_owed > 0 && (
              <p className={`rounded-xl p-3 ${c.finance_ticket_number ? "bg-brand-light/60 text-brand-dark" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                {c.finance_ticket_number
                  ? `✓ Vendor Payment ticket ${c.finance_ticket_number} opened for ${usd(c.amount_owed)}.`
                  : `Amount owed ${usd(c.amount_owed)} is waiting: ${c.ticket_error ?? "no ticket yet"}`}
              </p>
            )}
            {result.chargeWarnings?.map((w, i) => (
              <p key={i} className="text-xs text-amber-700">
                {w}
              </p>
            ))}
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
          Take a photo of each page of the food bank&apos;s invoice, or upload the PDF. The portal reads the lines for you to check.
        </p>
        <div className="mb-6">
          <StationOfficeBar station={station} />
        </div>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addFiles(e.target.files, e.target)} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files, e.target)} />

        {pdf && <p className="text-sm text-gray-600 mb-2">📄 {pdf.file.name} — {pages.length} page{pages.length === 1 ? "" : "s"}</p>}
        {pages.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {pages.map((p, i) => (
              <div key={p.url} className="relative rounded-xl overflow-hidden border border-gray-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Invoice page ${i + 1}`} className="w-full h-36 object-cover object-top" />
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
            {!pdf && pages.length < MAX_PAGES && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={preparing}
                  className="tap-target rounded-2xl border-2 border-dashed border-brand/50 bg-white px-4 py-6 text-brand-dark font-semibold active:scale-95 transition"
                >
                  {pages.length === 0 ? "📷 Take Photo" : "📷 Add Page"}
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={preparing}
                  className="tap-target rounded-2xl border-2 border-dashed border-brand/50 bg-white px-4 py-6 text-brand-dark font-semibold active:scale-95 transition"
                >
                  {preparing ? "Opening…" : "📄 Upload PDF / File"}
                </button>
              </div>
            )}
            <button
              onClick={readInvoice}
              disabled={pages.length === 0 || !station.office || preparing}
              className="tap-target w-full rounded-2xl bg-brand px-8 py-5 text-lg font-semibold text-white shadow-lg active:scale-95 transition disabled:opacity-40"
            >
              Read Invoice
            </button>
            <p className="text-xs text-gray-400 text-center">Photos: lay the invoice flat, fill the frame, and avoid glare.</p>
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
  const renderLine = (l: Line) => {
    const item = byCode.get(l.item_code);
    const q = Number(l.qty);
    const lineValue = item && q > 0 ? item.new_price * q : 0;
    const flagged = l.inkind && (l.confidence === "low" || !l.item_code || !(q > 0));
    return (
      <div key={l.key} className={`p-3 ${!l.inkind ? "bg-gray-50" : flagged ? "bg-amber-50" : l.confidence === "medium" ? "bg-yellow-50/40" : ""}`}>
        <div className="flex items-start gap-2 mb-2">
          <input
            value={l.description}
            onChange={(e) => updateLine(l.key, { description: e.target.value })}
            placeholder="As printed on the invoice"
            className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700"
          />
          <span className="text-xs text-gray-400 whitespace-nowrap pt-2">
            {l.weight_lbs != null && `${l.weight_lbs} lb`}
            {Number(l.product_cost) > 0 && ` · cost ${usd(Number(l.product_cost))}`}
          </span>
          {zeroCostRule && (
            <button
              onClick={() => updateLine(l.key, { inkind: !l.inkind })}
              className="text-xs rounded-lg bg-gray-100 px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap"
              title={l.inkind ? "Mark as purchased (not in-kind)" : "Count as in-kind"}
            >
              {l.inkind ? "Purchased?" : "In-kind?"}
            </button>
          )}
          <button onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-gray-400 hover:text-red-600 px-2 pt-1" aria-label="Remove line">
            ✕
          </button>
        </div>
        {l.inkind && (
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
            <span className="text-sm font-semibold w-20 text-right">{usd(lineValue)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
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
              <img src={p.url} alt={`Page ${i + 1}`} className="w-full h-full object-cover object-top" />
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
          {profiles.length > 0 ? (
            <select value={profileId} onChange={(e) => chooseProfile(e.target.value)} className="w-full mt-1 rounded-lg border border-gray-300 p-3 bg-white">
              <option value="">Other (every line in-kind)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          {(!profileId || profiles.length === 0) && (
            <>
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
            </>
          )}
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
        {zeroCostRule && (
          <p className="sm:col-span-3 text-xs text-gray-500">
            {profile?.name}: only lines with $0 product cost are in-kind. Purchased lines are listed separately and left out of Salesforce.
          </p>
        )}
      </div>

      <h2 className="text-sm font-bold text-gray-500 mb-2">
        In-kind ({inkindLines.length} line{inkindLines.length === 1 ? "" : "s"})
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 mb-5">
        {inkindLines.map(renderLine)}
        <button
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { key: newKey(), description: "", section: null, weight_lbs: null, product_cost: null, maintenance_fee: null, item_code: "", qty: "", confidence: "high", inkind: true },
            ])
          }
          className="w-full p-3 text-sm font-semibold text-brand-dark hover:bg-gray-50"
        >
          + Add line
        </button>
      </div>

      {purchasedLines.length > 0 && (
        <div className="mb-5">
          <button onClick={() => setShowPurchased((v) => !v)} className="text-sm font-bold text-gray-500 mb-2">
            {showPurchased ? "▾" : "▸"} Purchased — not in-kind ({purchasedLines.length} line{purchasedLines.length === 1 ? "" : "s"}, {usd(totals.purchased)})
          </button>
          {showPurchased && <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">{purchasedLines.map(renderLine)}</div>}
        </div>
      )}

      {tracksCharges && (
        <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-1">Charges on this invoice</h2>
          <p className="text-xs text-gray-500 mb-3">
            Grant credits post to the grant in Grant Management. The amount owed opens a Vendor Payment ticket for{" "}
            {station.office?.name ?? "this office"} so Finance pays {profile?.name ?? "the food bank"}.
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-600">Total charges</span>
              <MoneyInput value={totalCharges} onChange={setTotalCharges} />
            </div>
            {credits.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-gray-600 min-w-0">
                  Less grant <span className="font-mono">{c.ref || "—"}</span> <span className="text-xs text-gray-400">{c.label}</span>
                  <span className={`block text-xs ${c.mapped ? "text-brand-dark" : "text-amber-700"}`}>
                    {c.mapped ? "→ Grant Management (auto-approved)" : "Not mapped to a Grant Management grant yet — it'll wait on the InKind dashboard"}
                  </span>
                </span>
                <MoneyInput value={c.amount} onChange={(v) => setCredits((prev) => prev.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
              <span className="text-gray-800 font-semibold">
                Amount owed
                <span className="block text-xs font-normal text-gray-500">
                  → Vendor Payment ticket{!profile?.has_requestor ? " (opened under you if you're signed in)" : ""}
                </span>
              </span>
              <MoneyInput value={amountOwed} onChange={setAmountOwed} />
            </div>
            {chargeCheck.off && (
              <p className="text-xs text-amber-700">
                Grant credits ({usd(chargeCheck.granted)}) + amount owed ({usd(chargeCheck.owed)}) don&apos;t add up to the total charges ({usd(chargeCheck.total)}).
              </p>
            )}
          </div>
        </section>
      )}

      {/* Room so the fixed footer never hides the last lines */}
      <div aria-hidden className="h-56 sm:h-36" />

      {/* Sticky totals + save */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm">
            <p className="font-bold text-brand-dark text-lg">
              {usd(totals.value)} <span className="text-xs font-medium text-gray-500">in-kind</span>
              {hasCharges && <span className="text-xs font-medium text-gray-500"> · {usd(chargeCheck.owed)} owed · {usd(chargeCheck.granted)} grant</span>}
            </p>
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
            <button onClick={() => save(pushing, true)} className="rounded-xl bg-amber-600 px-6 py-4 font-semibold text-white active:scale-95 transition">
              Save Anyway
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => save(false)}
                disabled={!canSave || step === "saving"}
                className="flex-1 sm:flex-none rounded-xl border-2 border-brand bg-white px-6 py-4 font-semibold text-brand-dark active:scale-95 transition disabled:opacity-40"
              >
                {step === "saving" && !pushing ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => save(true)}
                disabled={!canSave || step === "saving"}
                className="flex-1 sm:flex-none rounded-xl bg-brand px-6 py-4 font-semibold text-white active:scale-95 transition disabled:opacity-40"
              >
                {step === "saving" && pushing ? "Saving & pushing…" : hasCharges ? "Save & Push All" : "Save & Push to Salesforce"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-gray-400">$</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-lg border border-gray-300 p-2 text-right"
      />
    </div>
  );
}

function matchKnown(name: string, known: string[] | undefined): string | null {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  return (
    known?.find((k) => {
      const kk = k.toLowerCase().replace(/[^a-z]/g, "");
      return kk.includes(n) || n.includes(kk);
    }) ?? null
  );
}
