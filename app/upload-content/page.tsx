import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";

export default async function UploadContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: folders } = await supabase
    .from("content_folders")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <h1
            style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}
          >
            Upload Content
          </h1>
          <Link href="/select-app" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back
          </Link>
        </div>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          Pick a program, then upload your photos or documents — they'll land directly in that
          program's shared Dropbox folder, organized and easy for anyone to find later.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(folders ?? []).map((f) => (
            <Link
              key={f.id}
              href={`/upload-content/${f.id}`}
              className="rounded-xl bg-white p-5 transition-all hover:-translate-y-0.5"
              style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
            >
              <div className="text-sm font-bold">{f.name}</div>
            </Link>
          ))}
        </div>

        {(folders ?? []).length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No upload categories have been set up yet.
          </p>
        )}
      </div>
    </main>
  );
}
