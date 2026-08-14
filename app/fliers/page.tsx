import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";

export default async function FliersGalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: templates } = await supabase
    .from("flier_templates")
    .select("id, name, category")
    .eq("is_active", true)
    .order("category")
    .order("name");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <h1
            style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}
          >
            Make a Flier
          </h1>
          <Link href="/select-app" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back
          </Link>
        </div>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          Pick a template, fill in your event details, and download — the design is locked to
          brand guidelines, so there's nothing to get wrong.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(templates ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/fliers/${t.id}`}
              className="rounded-xl bg-white p-5 transition-all hover:-translate-y-0.5"
              style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
            >
              <div className="text-sm font-bold">{t.name}</div>
              {t.category && (
                <div className="text-[11px] mt-0.5" style={{ color: "rgba(22,48,43,0.45)" }}>
                  {t.category}
                </div>
              )}
            </Link>
          ))}
        </div>

        {(templates ?? []).length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No templates have been published yet.
          </p>
        )}
      </div>
    </main>
  );
}
