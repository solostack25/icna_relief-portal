"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";

type Video = { id: string; title: string; description: string; thumbnail: string; publishedAt: string; url: string };

export default function YouTubeTab() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Video | null>(null);

  useEffect(() => {
    fetch("/api/social-media/youtube")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setVideos(d.videos);
          setActive(d.videos?.[0] ?? null);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle="Social Media · YouTube" />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href="/social-media" className="text-sm mb-4 inline-block" style={{ color: "rgba(22,48,43,0.55)" }}>
          ← Social Media
        </Link>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 20px" }}>
          YouTube
        </h1>

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
            No videos found on this channel.
          </p>
        )}

        {active && (
          <div className="mb-6 rounded-2xl overflow-hidden" style={{ boxShadow: "0 3px 12px rgba(22,48,43,0.08)" }}>
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={`https://www.youtube.com/embed/${active.id}`}
                title={active.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              />
            </div>
            <div className="bg-white p-4">
              <p className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
                {active.title}
              </p>
              <p className="text-xs mt-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                {new Date(active.publishedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}

        {videos && videos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {videos.map((v) => (
              <button
                key={v.id}
                onClick={() => setActive(v)}
                className="text-left cursor-pointer rounded-xl overflow-hidden bg-white"
                style={{
                  border: active?.id === v.id ? "2px solid var(--portal-emerald)" : "1px solid var(--portal-line)",
                }}
              >
                <img src={v.thumbnail} alt={v.title} className="w-full aspect-video object-cover" />
                <div className="p-2">
                  <p className="text-xs font-semibold line-clamp-2" style={{ color: "#2F4A3E" }}>
                    {v.title}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
