"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";

type Media = {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  permalink: string;
  timestamp: string;
};

export default function InstagramTab() {
  const [media, setMedia] = useState<Media[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/social-media/instagram")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setMedia(d.media)))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle="Social Media · Instagram" />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href="/social-media" className="text-sm mb-4 inline-block" style={{ color: "rgba(22,48,43,0.55)" }}>
          ← Social Media
        </Link>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 20px" }}>
          Instagram
        </h1>

        {error && (
          <div className="rounded-2xl p-5 text-sm" style={{ background: "#FCEFDD", color: "#8A5A1E" }}>
            {error}
          </div>
        )}
        {!error && !media && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            Loading…
          </p>
        )}
        {media && media.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No posts found.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {media?.map((m) => (
            <a
              key={m.id}
              href={m.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden relative group"
              style={{ border: "1px solid var(--portal-line)" }}
              title={m.caption ?? undefined}
            >
              <img
                src={m.mediaType === "VIDEO" ? m.thumbnailUrl ?? m.mediaUrl : m.mediaUrl}
                alt={m.caption ?? ""}
                className="w-full aspect-square object-cover"
              />
              {m.mediaType === "VIDEO" && (
                <span className="absolute top-1.5 right-1.5 text-white text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.55)" }}>
                  ▶
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
