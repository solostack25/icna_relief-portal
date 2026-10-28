"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FlierTemplateGallery, { type GalleryTemplate } from "@/components/FlierTemplateGallery";

const SELECT = "id, name, category, program, language, format_label, is_active, updated_at, canvas_width, canvas_height, canvas_background, thumbnail_data_url, extra_pages, editable_element_ids, review_status, source";

export default function TemplatesListClient() {
  const supabase = createClient();
  const router = useRouter();
  const [templates, setTemplates] = useState<GalleryTemplate[] | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data } = await supabase.from("flier_templates").select(SELECT).order("updated_at", { ascending: false });
    setTemplates((data as GalleryTemplate[]) ?? []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createNew() {
    setCreating(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user!.id).single();
    const { data, error } = await supabase
      .from("flier_templates")
      .insert({ name: "Untitled Template", canvas_width: 1080, canvas_height: 1350, canvas_data: [], created_by: employee?.id })
      .select("id")
      .single();
    setCreating(false);
    if (!error && data) router.push(`/admin/fliers/builder/${data.id}`);
  }

  async function review(t: GalleryTemplate, status: "approved" | "rejected") {
    await fetch("/api/marketing/fliers/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: t.id, status }) });
    load();
  }

  async function toggleActive(t: GalleryTemplate) {
    await supabase.from("flier_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  if (!templates) {
    return (
      <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
        Loading…
      </p>
    );
  }

  const blankTile = (
    <button
      onClick={createNew}
      disabled={creating}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl cursor-pointer disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform duration-150"
      style={{ aspectRatio: "4 / 5", maxHeight: 300, border: "2.5px dashed var(--portal-emerald)", background: "#F3F9F5" }}
    >
      <span className="flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: "var(--portal-emerald)", color: "white", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
        +
      </span>
      <span className="text-sm font-bold" style={{ color: "var(--portal-emerald)" }}>
        {creating ? "Creating…" : "New Template"}
      </span>
    </button>
  );

  return <FlierTemplateGallery templates={templates} hrefFor={(t) => `/admin/fliers/builder/${t.id}`} admin onToggleActive={toggleActive} onReview={review} leading={blankTile} />;
}
