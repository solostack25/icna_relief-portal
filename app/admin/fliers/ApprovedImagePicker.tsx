"use client";

import { useEffect, useState } from "react";

type ApprovedImage = { id: string; dropbox_path: string; display_name: string | null; link: string };
type StockPhoto = { id: string; thumbUrl: string; fullUrl: string; photographer: string; pexelsUrl: string };
type Selected = { dropbox_path: string | null; link: string };

export default function ApprovedImagePicker({
  onClose,
  onSelect,
  allowMore = false,
}: {
  onClose: () => void;
  onSelect: (img: Selected) => void;
  allowMore?: boolean;
}) {
  const [tab, setTab] = useState<"approved" | "stock" | "upload">("approved");
  const [images, setImages] = useState<ApprovedImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stockQuery, setStockQuery] = useState("");
  const [stockPhotos, setStockPhotos] = useState<StockPhoto[] | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/flier-images")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setImages(body.images);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function searchStock() {
    if (stockQuery.trim().length < 2) return;
    setStockLoading(true);
    setStockError(null);
    try {
      const res = await fetch(`/api/marketing/stock-photos?q=${encodeURIComponent(stockQuery.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setStockPhotos(body.photos);
    } catch (e: any) {
      setStockError(e.message);
    } finally {
      setStockLoading(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/marketing/quick-upload", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onSelect({ dropbox_path: body.image.dropbox_path, link: body.image.link });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-end lg:items-center justify-center lg:p-4 z-50"
      style={{ background: "rgba(22,48,43,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white p-5 w-full rounded-t-3xl max-h-[75vh] lg:max-w-lg lg:rounded-2xl lg:max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab-handle affordance signals "swipe/tap to dismiss" on a bottom
            sheet - meaningless on the centered desktop dialog, so hidden there. */}
        <div className="flex justify-center mb-2 lg:hidden">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--portal-line)" }} />
        </div>

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Choose an Image</h3>
          <button onClick={onClose} className="text-sm cursor-pointer" style={{ color: "rgba(22,48,43,0.5)" }}>
            ✕
          </button>
        </div>

        {allowMore && (
          <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid var(--portal-line)" }}>
            {(["approved", "stock", "upload"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-xs font-semibold px-3 py-2 cursor-pointer capitalize"
                style={{
                  color: tab === t ? "var(--portal-emerald)" : "rgba(22,48,43,0.5)",
                  borderBottom: tab === t ? "2px solid var(--portal-emerald)" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t === "stock" ? "Stock Photos" : t}
              </button>
            ))}
          </div>
        )}

        {tab === "approved" && (
          <>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!images && !error && <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>}
            {images && images.length === 0 && (
              <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
                No approved images yet. Marketing can approve images from{" "}
                <a href="/admin/fliers/images" className="underline">
                  Approved Images
                </a>
                .
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {images?.map((img) => (
                <button
                  key={img.id}
                  onClick={() => onSelect({ dropbox_path: img.dropbox_path, link: img.link })}
                  className="rounded-lg overflow-hidden cursor-pointer aspect-square"
                  style={{ border: "1px solid var(--portal-line)" }}
                >
                  <img src={img.link} alt={img.display_name ?? ""} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "stock" && allowMore && (
          <>
            <div className="flex gap-2 mb-3">
              <input
                value={stockQuery}
                onChange={(e) => setStockQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchStock()}
                placeholder="Search free stock photos…"
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--portal-line)" }}
              />
              <button
                onClick={searchStock}
                className="text-xs px-4 py-2 rounded-lg text-white font-medium cursor-pointer"
                style={{ background: "var(--portal-emerald)" }}
              >
                Search
              </button>
            </div>
            {stockError && <p className="text-sm text-red-600">{stockError}</p>}
            {stockLoading && <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Searching…</p>}
            {stockPhotos && stockPhotos.length === 0 && !stockLoading && (
              <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
                No results.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {stockPhotos?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect({ dropbox_path: null, link: p.fullUrl })}
                  className="rounded-lg overflow-hidden cursor-pointer aspect-square"
                  style={{ border: "1px solid var(--portal-line)" }}
                  title={`Photo by ${p.photographer} on Pexels`}
                >
                  <img src={p.thumbUrl} alt={p.photographer} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            {stockPhotos && stockPhotos.length > 0 && (
              <p className="text-[10px] mt-3" style={{ color: "rgba(22,48,43,0.4)" }}>
                Photos via Pexels.
              </p>
            )}
          </>
        )}

        {tab === "upload" && allowMore && (
          <div className="rounded-2xl p-8 text-center" style={{ border: "2px dashed var(--portal-line)" }}>
            <input
              type="file"
              id="quick-upload-input"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            />
            <label
              htmlFor="quick-upload-input"
              className="text-sm font-medium cursor-pointer"
              style={{ color: "var(--portal-emerald)" }}
            >
              {uploading ? "Uploading…" : "Click to upload an image"}
            </label>
            <p className="text-xs mt-1" style={{ color: "rgba(22,48,43,0.45)" }}>
              Uploaded and ready to use immediately - no separate approval step needed.
            </p>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
