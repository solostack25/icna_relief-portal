"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";

type Video = { id: string; url: string; title: string | null; thumbnailUrl: string | null; authorName: string | null; created_at: string };

export default function TikTokTab({ isAdmin }: { isAdmin: boolean }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function load() {
    fetch("/api/social-media/tiktok")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setVideos(d.videos)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function addVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/social-media/tiktok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setNewUrl("");
      load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function removeVideo(id: string) {
    await fetch("/api/social-media/tiktok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, remove: true }),
    });
    load();
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle="Social Media · TikTok" />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href="/social-media" className="text-sm mb-4 inline-block" style={{ color: "rgba(22,48,43,0.55)" }}>
          ← Social Media
        </Link>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
          TikTok
        </h1>
        <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
          TikTok doesn't offer a way to pull a live feed for internal tools like this one, so this is a
          hand-picked list{isAdmin ? " - add or remove videos below" : ""}.
        </p>

        {isAdmin && (
          <form onSubmit={addVideo} className="flex gap-2 mb-6">
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="Paste a TikTok video URL…"
              className="flex-1 rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            />
            <button
              type="submit"
              disabled={adding || !newUrl.trim()}
              className="text-sm px-4 py-2 rounded-lg text-white font-bold cursor-pointer disabled:opacity-50"
              style={{ background: "var(--portal-emerald)" }}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </form>
        )}
        {addError && <p className="text-xs text-red-600 mb-4">{addError}</p>}

        {error && (
          <div className="rounded-2xl p-5 text-sm" style={{ background: "#FCEFDD", color: "#8A5A1E" }}>
            {error}
          </div>
        )}
        {!error && !videos && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            Loading…
          </p>
        )}
        {videos && videos.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No videos added yet.
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {videos?.map((v) => (
            <div key={v.id} className="relative rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--portal-line)" }}>
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="block">
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt={v.title ?? ""} className="w-full aspect-[9/16] object-cover" />
                ) : (
                  <div className="w-full aspect-[9/16] flex items-center justify-center" style={{ background: "#F4F3EE" }}>
                    <span className="text-xs" style={{ color: "rgba(22,48,43,0.4)" }}>
                      No preview
                    </span>
                  </div>
                )}
                <div className="p-2">
                  <p className="text-xs font-semibold line-clamp-2" style={{ color: "#2F4A3E" }}>
                    {v.title ?? v.url}
                  </p>
                  {v.authorName && (
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(22,48,43,0.5)" }}>
                      @{v.authorName}
                    </p>
                  )}
                </div>
              </a>
              {isAdmin && (
                <button
                  onClick={() => removeVideo(v.id)}
                  className="absolute top-1.5 right-1.5 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ background: "rgba(0,0,0,0.55)" }}
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
