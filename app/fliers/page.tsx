import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import FlierTemplateGallery, { type GalleryTemplate } from "@/components/FlierTemplateGallery";

export default async function FliersGalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: templates } = await supabase
    .from("flier_templates")
    .select("id, name, category, program, language, format_label, is_active, updated_at, canvas_width, canvas_height, canvas_background, thumbnail_data_url, extra_pages, editable_element_ids")
    .eq("is_active", true)
    .eq("review_status", "approved")
    .order("updated_at", { ascending: false });

  // "Recently used by your office": this employee's own recent downloads.
  let recentIds: string[] = [];
  const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (employee) {
    const { data: downloads } = await supabase.from("flier_downloads").select("template_id, created_at").eq("employee_id", employee.id).order("created_at", { ascending: false }).limit(30);
    recentIds = [...new Set((downloads ?? []).map((d) => d.template_id as string))];
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Make a Flier</h1>
          <Link href="/select-app" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back
          </Link>
        </div>
        <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
          Pick a template, fill in your event details, and download a hi-res PNG or a print-ready PDF — the design is locked to brand guidelines, so there's nothing to get wrong.
        </p>
        <FlierTemplateGallery templates={(templates as GalleryTemplate[]) ?? []} hrefFor={(t) => `/fliers/${t.id}`} recentIds={recentIds} />
      </div>
    </main>
  );
}
