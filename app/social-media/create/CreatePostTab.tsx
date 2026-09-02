"use client";

import { useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";

export default function CreatePostTab() {
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ facebook: string; instagram: string } | null>(null);
  const [copied, setCopied] = useState<"facebook" | "instagram" | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setImageDataUri(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!imageDataUri || !description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/social-media/create-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUri, description: description.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function copy(platform: "facebook" | "instagram", text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle="Social Media · Create a Post" />
      <div className="max-w-xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href="/social-media" className="text-sm mb-4 inline-block" style={{ color: "rgba(22,48,43,0.55)" }}>
          ← Social Media
        </Link>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
          Create a Post
        </h1>
        <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
          Upload a photo and describe what it's for - get a ready-to-use caption for Facebook and Instagram to
          copy and paste when you post. This doesn't publish anything itself.
        </p>

        <div className="rounded-2xl bg-white p-5 mb-6" style={{ border: "1px solid var(--portal-line)" }}>
          <label className="block text-xs font-bold mb-1.5" style={{ color: "#2F4A3E" }}>
            Photo
          </label>
          {imageDataUri ? (
            <div className="relative mb-3">
              <img src={imageDataUri} alt="" className="w-full rounded-lg max-h-64 object-cover" />
              <button
                onClick={() => setImageDataUri(null)}
                className="absolute top-2 right-2 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: "rgba(0,0,0,0.55)" }}
              >
                ✕
              </button>
            </div>
          ) : (
            <label
              className="flex items-center justify-center rounded-lg cursor-pointer mb-3 py-8 text-sm"
              style={{ border: "2px dashed var(--portal-line)", color: "rgba(22,48,43,0.5)" }}
            >
              Click to choose a photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          )}

          <label className="block text-xs font-bold mb-1.5" style={{ color: "#2F4A3E" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="e.g. Volunteers packing food boxes at the Saturday food pantry"
            className="w-full rounded-lg px-3 py-2 text-sm mb-4"
            style={{ border: "1px solid var(--portal-line)" }}
          />

          <button
            onClick={generate}
            disabled={loading || !imageDataUri || !description.trim()}
            className="w-full rounded-full py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "var(--portal-emerald)" }}
          >
            {loading ? "Writing captions…" : "✨ Generate Captions"}
          </button>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        {result && (
          <div className="space-y-4">
            <CaptionCard
              label="Facebook"
              color="#1877F2"
              text={result.facebook}
              copied={copied === "facebook"}
              onCopy={() => copy("facebook", result.facebook)}
            />
            <CaptionCard
              label="Instagram"
              color="#C13584"
              text={result.instagram}
              copied={copied === "instagram"}
              onCopy={() => copy("instagram", result.instagram)}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function CaptionCard({
  label,
  color,
  text,
  copied,
  onCopy,
}: {
  label: string;
  color: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-5" style={{ border: "1px solid var(--portal-line)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold flex items-center gap-2" style={{ color: "#2F4A3E" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <button
          onClick={onCopy}
          className="text-xs font-bold px-3 py-1.5 rounded-full cursor-pointer"
          style={{ border: `1.5px solid ${color}`, color: copied ? "#fff" : color, background: copied ? color : "transparent" }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="text-sm whitespace-pre-wrap" style={{ color: "#2F4A3E" }}>
        {text}
      </p>
    </div>
  );
}
