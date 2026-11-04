"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StationOfficeBar, { useStationOffice } from "@/app/inkind/components/StationOffice";

type Item = { category: string | null; description: string; qty: number | null; unit: string | null; condition: "used" | "new" | null };
type Fields = {
  donor_name: string | null;
  donor_phone: string | null;
  donor_email: string | null;
  donor_address: string | null;
  receipt_number: string | null;
  receipt_date: string | null;
  received_by: string | null;
  items: Item[];
  notes: string | null;
};
type Receipt = Fields & { id: string; image_paths: string[] | null; created_at: string };
type Session = { id: string; name: string };
type Photo = { url: string; blob: Blob };

const MAX_PHOTOS = 4;

// Same in-browser shrink as the food bank intake, so uploads stay small.
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

export default function ReceiptSessionPage({ params }: { params: { sessionId: string } }) {
  const sessionId = params.sessionId;
  const router = useRouter();
  const station = useStationOffice();
  const officeId = station.officeId;
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [reading, setReading] = useState(false);
  // The receipt being reviewed: a fresh scan (paths set) or an existing row (editId set).
  const [draft, setDraft] = useState<Fields | null>(null);
  const [draftPaths, setDraftPaths] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!officeId) return;
    const res = await fetch(`/api/inkind/receipts/sessions/${sessionId}?officeId=${officeId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setLoadError(res.status === 401 ? "Sign in to the portal to use Scan Receipts." : data.error ?? "Couldn't load this session");
    setLoadError(null);
    setSession(data.session);
    setReceipts(data.receipts ?? []);
  }, [officeId, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function addPhotos(files: FileList | null, input: HTMLInputElement | null) {
    if (!files?.length) return;
    setError(null);
    const next = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ blob: f as Blob, url: URL.createObjectURL(f) }));
    setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
    if (input) input.value = "";
  }

  function clearPhotos() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
  }

  async function readReceipt() {
    if (!officeId || photos.length === 0) return;
    setReading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("officeId", officeId);
      for (const p of photos) form.append("images", await shrinkImage(p.blob), "receipt.jpg");
      const res = await fetch(`/api/inkind/receipts/sessions/${sessionId}/scan`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: `Upload failed (HTTP ${res.status})` }));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the receipt");
      setDraft(data.fields);
      setDraftPaths(data.paths ?? []);
      setWarnings(data.warnings ?? []);
      setEditId(null);
      clearPhotos();
    } catch (e: any) {
      setError(e.message ?? "Couldn't read the receipt");
    } finally {
      setReading(false);
    }
  }

  async function saveDraft() {
    if (!draft || !officeId) return;
    setSaving(true);
    setError(null);
    try {
      const url = editId
        ? `/api/inkind/receipts/sessions/${sessionId}/receipts/${editId}`
        : `/api/inkind/receipts/sessions/${sessionId}/receipts`;
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, fields: draft, paths: draftPaths }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the receipt");
      if (editId) {
        setReceipts((prev) => prev.map((r) => (r.id === editId ? data.receipt : r)));
        setFlash("Row updated");
      } else {
        setReceipts((prev) => [...prev, data.receipt]);
        setFlash(`Added ${data.receipt.donor_name ?? "receipt"} as line ${receipts.length + 1}`);
      }
      closeDraft();
      setTimeout(() => setFlash(null), 3000);
    } catch (e: any) {
      setError(e.message ?? "Couldn't save the receipt");
    } finally {
      setSaving(false);
    }
  }

  async function discardDraft() {
    if (!editId && draftPaths.length && officeId) {
      fetch(`/api/inkind/receipts/sessions/${sessionId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, paths: draftPaths, discard: true }),
      }).catch(() => {});
    }
    closeDraft();
  }

  function closeDraft() {
    setDraft(null);
    setDraftPaths([]);
    setWarnings([]);
    setEditId(null);
  }

  function editRow(r: Receipt) {
    const { id, image_paths, created_at, ...fields } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    setDraft({ ...fields, items: fields.items ?? [] });
    setDraftPaths([]);
    setWarnings([]);
    setEditId(r.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRow(r: Receipt, line: number) {
    if (!officeId || !confirm(`Delete line ${line} (${r.donor_name ?? "receipt"})? Rows below it move up.`)) return;
    const res = await fetch(`/api/inkind/receipts/sessions/${sessionId}/receipts/${r.id}?officeId=${officeId}`, { method: "DELETE" });
    if (res.ok) setReceipts((prev) => prev.filter((x) => x.id !== r.id));
    else setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete");
  }

  // Always asks the server for a fresh file (cache-busting param) and saves
  // it under the server's time-stamped name.
  async function downloadExcel() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inkind/receipts/sessions/${sessionId}/export?officeId=${officeId}&t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't build the Excel file");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Receipts.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e.message ?? "Couldn't build the Excel file");
    } finally {
      setDownloading(false);
    }
  }

  async function rename() {
    const name = nameInput.trim();
    if (!name || !officeId) return setRenaming(false);
    const res = await fetch(`/api/inkind/receipts/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officeId, name }),
    });
    if (res.ok) setSession((s) => (s ? { ...s, name } : s));
    setRenaming(false);
  }

  async function deleteSession() {
    if (!officeId || !confirm(`Delete "${session?.name}" and all ${receipts.length} receipts in it? This can't be undone.`)) return;
    const res = await fetch(`/api/inkind/receipts/sessions/${sessionId}?officeId=${officeId}`, { method: "DELETE" });
    if (res.ok) router.push("/inkind/receipts");
    else setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete the session");
  }

  const set = (patch: Partial<Fields>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const itemCount = receipts.reduce((a, r) => a + (r.items?.length ?? 0), 0);

  if (!station.loaded) return null;
  if (!station.office) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
        <StationOfficeBar station={station} />
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-600">{loadError}</p>
        <Link href="/inkind/receipts" className="underline text-brand-dark">
          Back to sessions
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/inkind/receipts" className="text-sm text-gray-500 underline">
            ← All sessions
          </Link>
          <StationOfficeBar station={station} />
        </div>

        <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            {renaming ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && rename()}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-lg"
                />
                <button onClick={rename} className="rounded-lg bg-brand px-4 text-white font-semibold">
                  Save
                </button>
              </div>
            ) : (
              <h1 className="text-2xl font-bold text-brand-dark truncate">
                {session?.name ?? "…"}
                <button
                  onClick={() => {
                    setNameInput(session?.name ?? "");
                    setRenaming(true);
                  }}
                  className="ml-2 text-sm font-normal text-gray-500 underline"
                >
                  rename
                </button>
              </h1>
            )}
            <p className="text-sm text-gray-500">
              {receipts.length} receipt{receipts.length === 1 ? "" : "s"} · {itemCount} item{itemCount === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={downloadExcel}
            disabled={!receipts.length || downloading}
            className={`tap-target rounded-xl px-5 py-3 font-semibold shadow transition ${
              receipts.length ? "bg-brand-dark text-white active:scale-95" : "bg-gray-200 text-gray-400"
            }`}
          >
            {downloading ? "Preparing…" : `⬇ Download Excel (${receipts.length})`}
          </button>
        </div>

        {/* Scan */}
        {!draft && (
          <div className="rounded-2xl border-2 border-dashed border-brand/40 bg-brand-light/40 p-5 text-center space-y-4">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPhotos(e.target.files, e.target)} />
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files, e.target)} />

            {photos.length === 0 ? (
              <>
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="tap-target w-full max-w-md rounded-2xl bg-brand px-8 py-6 text-xl font-semibold text-white shadow-lg active:scale-95 transition"
                >
                  📷 Scan Receipt
                </button>
                <div>
                  <button onClick={() => fileRef.current?.click()} className="text-sm text-gray-600 underline">
                    or upload a photo
                  </button>
                </div>
                <p className="text-xs text-gray-500">Next receipt goes on line {receipts.length + 1}.</p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap justify-center gap-3">
                  {photos.map((p, i) => (
                    <div key={p.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Receipt photo ${i + 1}`} className="h-40 w-auto rounded-lg border border-gray-300 object-contain bg-white" />
                      {!reading && (
                        <button
                          onClick={() =>
                            setPhotos((prev) => {
                              URL.revokeObjectURL(prev[i].url);
                              return prev.filter((_, j) => j !== i);
                            })
                          }
                          className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-600 text-white text-sm shadow"
                          aria-label="Remove photo"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <button
                    onClick={readReceipt}
                    disabled={reading}
                    className="tap-target rounded-2xl bg-brand px-8 py-4 text-lg font-semibold text-white shadow-lg active:scale-95 transition disabled:opacity-60"
                  >
                    {reading ? "Reading receipt…" : "Read Receipt"}
                  </button>
                  {photos.length < MAX_PHOTOS && !reading && (
                    <button
                      onClick={() => cameraRef.current?.click()}
                      className="tap-target rounded-2xl border-2 border-brand bg-white px-6 py-4 font-semibold text-brand-dark active:scale-95 transition"
                    >
                      + Add another photo
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {flash && <p className="text-center text-brand-dark font-semibold">✓ {flash}</p>}
        {error && <p className="text-center text-red-600 text-sm">{error}</p>}

        {/* Review */}
        {draft && (
          <div className="rounded-2xl border-2 border-brand bg-white p-5 shadow space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand-dark">
                {editId ? `Edit line ${receipts.findIndex((r) => r.id === editId) + 1}` : "Check the receipt"}
              </h2>
              <span className="text-xs text-gray-500">Fix anything the scan got wrong</span>
            </div>
            {warnings.length > 0 && (
              <ul className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 list-disc pl-6">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Text label="Donor name" value={draft.donor_name} onChange={(v) => set({ donor_name: v })} />
              <Text label="Phone" type="tel" value={draft.donor_phone} onChange={(v) => set({ donor_phone: v })} />
              <Text label="Email" type="email" value={draft.donor_email} onChange={(v) => set({ donor_email: v })} />
              <Text label="Receipt #" value={draft.receipt_number} onChange={(v) => set({ receipt_number: v })} />
              <Text label="Address" value={draft.donor_address} onChange={(v) => set({ donor_address: v })} className="sm:col-span-2" />
              <Text label="Date" type="date" value={draft.receipt_date} onChange={(v) => set({ receipt_date: v })} />
              <Text label="Received by" value={draft.received_by} onChange={(v) => set({ received_by: v })} />
            </div>
            {!draft.donor_name || !draft.donor_phone ? (
              <p className="text-sm text-amber-700">Name or phone wasn&apos;t read — fill it in from the receipt.</p>
            ) : null}

            <details className="rounded-lg border border-gray-200" open>
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-700">
                Items ({draft.items.length}) — saved on the separate Items tab
              </summary>
              <div className="p-3 space-y-2">
                {draft.items.map((it, i) => {
                  const upd = (patch: Partial<Item>) => set({ items: draft.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                      <input
                        value={it.description}
                        onChange={(e) => upd({ description: e.target.value })}
                        placeholder="Item"
                        title={it.category ?? undefined}
                        className="flex-1 min-w-[10rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <NumInput value={it.qty} placeholder="Qty" onChange={(v) => upd({ qty: v })} className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                      <select
                        value={it.unit ?? ""}
                        onChange={(e) => upd({ unit: e.target.value || null })}
                        className="rounded-lg border border-gray-300 px-1 py-1.5 text-sm"
                      >
                        <option value="">ea</option>
                        <option value="lbs">lbs</option>
                      </select>
                      <select
                        value={it.condition ?? ""}
                        onChange={(e) => upd({ condition: (e.target.value || null) as Item["condition"] })}
                        className="rounded-lg border border-gray-300 px-1 py-1.5 text-sm"
                      >
                        <option value="">—</option>
                        <option value="used">Used</option>
                        <option value="new">New</option>
                      </select>
                      <button onClick={() => set({ items: draft.items.filter((_, j) => j !== i) })} className="text-red-600 text-sm px-1" aria-label="Remove item">
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => set({ items: [...draft.items, { category: null, description: "", qty: 1, unit: null, condition: null }] })}
                  className="text-sm text-brand-dark underline"
                >
                  + Add item
                </button>
              </div>
            </details>

            <Text label="Notes" value={draft.notes} onChange={(v) => set({ notes: v })} />

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                onClick={saveDraft}
                disabled={saving}
                className="tap-target flex-1 rounded-2xl bg-brand px-6 py-4 text-lg font-semibold text-white shadow active:scale-95 transition disabled:opacity-60"
              >
                {saving ? "Saving…" : editId ? "Save Changes" : `Add as Line ${receipts.length + 1}`}
              </button>
              <button
                onClick={discardDraft}
                disabled={saving}
                className="tap-target rounded-2xl border-2 border-gray-300 bg-white px-6 py-4 font-semibold text-gray-600 active:scale-95 transition"
              >
                {editId ? "Cancel" : "Discard"}
              </button>
            </div>
          </div>
        )}

        {/* Rows = the Excel sheet */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Receipt #</th>
                <th className="px-3 py-2">Donor</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2">Received by</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                    No receipts yet — scan the first one above.
                  </td>
                </tr>
              ) : (
                receipts.map((r, i) => (
                  <tr key={r.id} className={`border-t border-gray-100 ${editId === r.id ? "bg-brand-light" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{i + 1}</td>
                    <td className="px-3 py-2">{r.receipt_number ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{r.donor_name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.donor_phone ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.receipt_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.items?.length ?? 0}</td>
                    <td className="px-3 py-2">{r.received_by ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right space-x-3">
                      {r.image_paths?.length ? (
                        <a
                          href={`/api/inkind/receipts/sessions/${sessionId}/receipts/${r.id}/image?officeId=${officeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-600 underline"
                        >
                          Photo
                        </a>
                      ) : null}
                      <button onClick={() => editRow(r)} className="text-brand-dark underline">
                        Edit
                      </button>
                      <button onClick={() => deleteRow(r, i + 1)} className="text-red-600 underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-center pt-2">
          <button onClick={deleteSession} className="text-xs text-red-600 underline">
            Delete this session
          </button>
        </div>
      </div>
    </main>
  );
}

function toNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
      />
    </label>
  );
}

// Keeps the raw text while typing ("12." stays "12.") and reports a number.
function NumInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if (toNum(text) !== value) setText(value == null ? "" : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toNum(e.target.value));
      }}
      className={className}
    />
  );
}
