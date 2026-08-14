"use client";

import { useEffect, useState } from "react";

type ApprovedImage = { id: string; dropbox_path: string; display_name: string | null; link: string };

export default function ApprovedImagePicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (img: ApprovedImage) => void;
}) {
  const [images, setImages] = useState<ApprovedImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/flier-images")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setImages(body.images);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ background: "rgba(22,48,43,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl bg-white p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Choose an Approved Image</h3>
          <button onClick={onClose} className="text-sm cursor-pointer" style={{ color: "rgba(22,48,43,0.5)" }}>
            ✕
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!images && !error && <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>}

        {images && images.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No approved images yet. Marketing can approve images from{" "}
            <a href="/marketing/fliers/images" className="underline">
              Approved Images
            </a>
            .
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {images?.map((img) => (
            <button
              key={img.id}
              onClick={() => onSelect(img)}
              className="rounded-lg overflow-hidden cursor-pointer aspect-square"
              style={{ border: "1px solid var(--portal-line)" }}
            >
              <img src={img.link} alt={img.display_name ?? ""} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
