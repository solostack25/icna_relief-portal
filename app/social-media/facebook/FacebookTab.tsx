"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";

type Post = { id: string; message: string | null; createdAt: string; permalink: string; imageUrl: string | null };

export default function FacebookTab() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/social-media/facebook")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setPosts(d.posts)))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle="Social Media · Facebook" />
      <div className="max-w-xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href="/social-media" className="text-sm mb-4 inline-block" style={{ color: "rgba(22,48,43,0.55)" }}>
          ← Social Media
        </Link>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 20px" }}>
          Facebook
        </h1>

        {error && (
          <div className="rounded-2xl p-5 text-sm" style={{ background: "#FCEFDD", color: "#8A5A1E" }}>
            {error}
          </div>
        )}
        {!error && !posts && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            Loading…
          </p>
        )}
        {posts && posts.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No posts found.
          </p>
        )}

        <div className="space-y-3">
          {posts?.map((p) => (
            <a
              key={p.id}
              href={p.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl bg-white overflow-hidden hover:-translate-y-0.5 transition-transform"
              style={{ border: "1px solid var(--portal-line)", boxShadow: "0 2px 8px rgba(22,48,43,0.05)" }}
            >
              {p.imageUrl && <img src={p.imageUrl} alt="" className="w-full aspect-video object-cover" />}
              <div className="p-4">
                {p.message && (
                  <p className="text-sm line-clamp-4" style={{ color: "#2F4A3E" }}>
                    {p.message}
                  </p>
                )}
                <p className="text-xs mt-2" style={{ color: "rgba(22,48,43,0.5)" }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
