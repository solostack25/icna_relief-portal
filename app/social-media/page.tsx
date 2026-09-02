import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";

const PLATFORMS = [
  { slug: "youtube", name: "YouTube", color: "#FF0000", description: "Latest uploads" },
  { slug: "facebook", name: "Facebook", color: "#1877F2", description: "Latest posts" },
  { slug: "instagram", name: "Instagram", color: "#C13584", description: "Latest posts" },
  { slug: "tiktok", name: "TikTok", color: "#000000", description: "Featured videos" },
];

export default async function SocialMediaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle="Social Media" />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href="/select-app" className="text-sm mb-4 inline-block" style={{ color: "rgba(22,48,43,0.55)" }}>
          ← Back
        </Link>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
          Social Media
        </h1>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          See the latest from ICNA Relief's own accounts, all in one place.
        </p>

        <Link
          href="/social-media/create"
          className="flex items-center justify-center gap-2 rounded-2xl p-4 mb-6 text-sm font-bold text-white transition-all hover:-translate-y-0.5"
          style={{ background: "var(--portal-emerald)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          ✨ Create a Post
        </Link>

        <div className="grid grid-cols-2 gap-3">
          {PLATFORMS.map((p) => (
            <Link
              key={p.slug}
              href={`/social-media/${p.slug}`}
              className="rounded-2xl bg-white p-5 transition-all hover:-translate-y-0.5"
              style={{ border: "1px solid var(--portal-line)", boxShadow: "0 2px 8px rgba(22,48,43,0.05)" }}
            >
              <div
                className="w-10 h-10 rounded-full mb-3 flex items-center justify-center text-white font-bold text-sm"
                style={{ background: p.color }}
              >
                {p.name[0]}
              </div>
              <div className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
                {p.name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(22,48,43,0.5)" }}>
                {p.description}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
