"use client";

import { useEffect, useState } from "react";

type ApprovedImage = { id: string; dropbox_path: string; display_name: string | null; link: string };
type StockPhoto = { id: string; thumbUrl: string; fullUrl: string; photographer: string; pexelsUrl: string };
type Selected = { dropbox_path: string | null; link: string };

export default function ApprovedImagePicker({
  onClose,
  onSelect,
  allowMore = false,
  docked = false,
}: {
  onClose: () => void;
  onSelect: (img: Selected) => void;
  allowMore?: boolean;
  // When true, render just the header/tabs/grid with no outer fixed-position
  // scrim or bottom-sheet shell - the caller docks this inline in its own
  // layout (a side panel on desktop, or its own bottom-sheet wrapper on
  // mobile) instead. Used by the flier builder's rail-triggered Photos
  // panel; the template-fill flow doesn't pass this and keeps the original
  // standalone modal behavior untouched.
  docked?: boolean;
}) {
  const [tab, setTab] = useState<"approved" | "stock" | "upload" | "ai">("approved");
  const [images, setImages] = useState<ApprovedImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stockQuery, setStockQuery] = useState("hunger prevention");
  const [stockPhotos, setStockPhotos] = useState<StockPhoto[] | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);

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

  // Pre-load a default stock search so the Stock Photos tab isn't empty the
  // first time someone opens it - "hunger prevention" matches ICNA Relief's
  // core program and is the most broadly useful default across flyers.
  // Runs once on mount regardless of which tab is active, so results are
  // already there by the time someone clicks into Stock Photos.
  useEffect(() => {
    searchStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateAiImage() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiImage(null);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim(), size: "1024x1024" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      // Route returns a short-lived Azure url or raw b64 depending on
      // config - normalize to a data: URI so the preview and the eventual
      // onSelect both work the same way regardless of which one came back.
      // Note: this means a generated image's actual pixel data ends up
      // inlined into the flyer's element JSON (same as the URL Pexels
      // stock photos use, but those stay small external links - this one
      // doesn't). Fine for occasional use; if this gets used heavily,
      // routing it through quick-upload's Dropbox flow instead (like file
      // uploads already do) would be worth doing so the JSON stays lean.
      const dataUri = body.b64 ? `data:image/png;base64,${body.b64}` : body.url;
      if (!dataUri) throw new Error("Image generation returned no result.");
      setAiImage(dataUri);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
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

  const content = (
    <>
      {/* Grab-handle affordance signals "swipe/tap to dismiss" on a bottom
          sheet - meaningless on the centered desktop dialog, so hidden there.
          Skipped entirely when docked, since a docked caller draws its own
          shared grab handle once above whichever panel content is active. */}
      {!docked && (
        <div className="flex justify-center mb-2 lg:hidden">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--portal-line)" }} />
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Choose an Image</h3>
        <button onClick={onClose} className="text-sm cursor-pointer" style={{ color: "rgba(22,48,43,0.5)" }}>
          ✕
        </button>
      </div>

      {allowMore && (
        <div className="flex flex-wrap gap-x-1 gap-y-1.5 mb-4" style={{ borderBottom: "1px solid var(--portal-line)" }}>
          {(["approved", "stock", "ai", "upload"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-xs font-semibold px-2.5 py-2 cursor-pointer capitalize"
              style={{
                color: tab === t ? "var(--portal-emerald)" : "rgba(22,48,43,0.5)",
                borderBottom: tab === t ? "2px solid var(--portal-emerald)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t === "stock" ? "Stock" : t === "ai" ? "AI Generate" : t}
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
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            />
            <button
              onClick={searchStock}
              className="text-xs px-4 py-2 rounded-lg text-white font-medium cursor-pointer flex-shrink-0"
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

      {tab === "ai" && allowMore && (
        <>
          <div className="flex gap-2 mb-3">
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generateAiImage()}
              placeholder="Describe the image you want…"
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            />
            <button
              onClick={generateAiImage}
              disabled={aiLoading || !aiPrompt.trim()}
              className="text-xs px-4 py-2 rounded-lg text-white font-medium cursor-pointer flex-shrink-0 disabled:opacity-50"
              style={{ background: "var(--portal-emerald)" }}
            >
              {aiLoading ? "Generating…" : "Generate"}
            </button>
          </div>
          {aiError && <p className="text-sm text-red-600">{aiError}</p>}
          {aiLoading && (
            <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
              Generating - this can take a few seconds…
            </p>
          )}
          {aiImage && !aiLoading && (
            <div>
              <button
                onClick={() => onSelect({ dropbox_path: null, link: aiImage })}
                className="rounded-lg overflow-hidden cursor-pointer w-full aspect-square block"
                style={{ border: "1px solid var(--portal-line)" }}
                title="Click to use this image"
              >
                <img src={aiImage} alt={aiPrompt} className="w-full h-full object-cover" />
              </button>
              <p className="text-[10px] mt-2" style={{ color: "rgba(22,48,43,0.4)" }}>
                Click the image to use it. AI-generated - always give it a quick look before using on a real flyer.
              </p>
            </div>
          )}
          {!aiImage && !aiLoading && !aiError && (
            <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
              Describe an image and generate an on-brand illustration or background.
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
    </>
  );

  if (docked) return content;

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
        {content}
      </div>
    </div>
  );
}
