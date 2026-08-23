"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Template = {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
  updated_at: string;
  canvas_width: number;
  canvas_height: number;
  canvas_background: string | null;
};

// A small rotating palette for category swatches/badges - not tied to
// brand meaning, just gives the grid visual variety the way Canva's
// template thumbnails do, since these cards have no real preview image
// to render (canvas_data is raw element JSON, not a rasterized thumb).
const SWATCHES = ["#2F6D46", "#E2892F", "#4A7FB5", "#B5566B", "#7A5FB0", "#3E9E8F"];
function swatchFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return SWATCHES[hash % SWATCHES.length];
}

export default function TemplatesListClient() {
  const supabase = createClient();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("flier_templates")
      .select("id, name, category, is_active, updated_at, canvas_width, canvas_height, canvas_background")
      .order("updated_at", { ascending: false });
    setTemplates(data);
  }
  useEffect(() => {
    load();
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

  async function toggleActive(t: Template, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
      {/* Blank canvas invite tile - first in the grid, Canva-style */}
      <button
        onClick={createNew}
        disabled={creating}
        className="flex flex-col items-center justify-center gap-3 rounded-3xl cursor-pointer disabled:opacity-50 hover:scale-[1.03] active:scale-95 transition-transform duration-150"
        style={{
          aspectRatio: "4 / 5",
          border: "2.5px dashed var(--portal-emerald)",
          background: "#F3F9F5",
        }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{ width: 48, height: 48, background: "var(--portal-emerald)", color: "white", fontSize: 26, fontWeight: 700, lineHeight: 1 }}
        >
          +
        </span>
        <span className="text-sm font-bold" style={{ color: "var(--portal-emerald)" }}>
          {creating ? "Creating…" : "New Template"}
        </span>
      </button>

      {templates.map((t) => {
        const swatch = swatchFor(t.category ?? t.name);
        const aspect = t.canvas_width && t.canvas_height ? `${t.canvas_width} / ${t.canvas_height}` : "4 / 5";
        return (
          <Link
            key={t.id}
            href={`/admin/fliers/builder/${t.id}`}
            className="flex flex-col rounded-3xl overflow-hidden bg-white cursor-pointer hover:scale-[1.03] hover:shadow-lg active:scale-95 transition-all duration-150"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 2px 6px rgba(22,48,43,0.06)" }}
          >
            <div
              className="flex items-center justify-center relative"
              style={{
                aspectRatio: aspect,
                background: t.canvas_background && t.canvas_background.startsWith("#") ? t.canvas_background : `${swatch}22`,
              }}
            >
              <span
                className="flex items-center justify-center rounded-full font-bold"
                style={{ width: 44, height: 44, background: swatch, color: "white", fontSize: 17 }}
              >
                {t.name.trim().charAt(0).toUpperCase() || "T"}
              </span>
              <span
                className="absolute top-2.5 right-2.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: t.is_active ? "var(--portal-emerald)" : "rgba(22,48,43,0.55)",
                  color: "white",
                }}
              >
                {t.is_active ? "Published" : "Draft"}
              </span>
            </div>
            <div className="p-3.5 flex-1 flex flex-col gap-1.5">
              <span className="text-sm font-bold leading-tight">{t.name}</span>
              <span className="text-[11px]" style={{ color: "rgba(22,48,43,0.45)" }}>
                {t.category ?? "Uncategorized"} · Updated {new Date(t.updated_at).toLocaleDateString()}
              </span>
              <button
                onClick={(e) => toggleActive(t, e)}
                className="self-start text-[11px] font-semibold mt-1 cursor-pointer hover:underline"
                style={{ color: "var(--portal-emerald)" }}
              >
                {t.is_active ? "Unpublish" : "Publish"}
              </button>
            </div>
          </Link>
        );
      })}

      {templates.length === 0 && (
        <p className="text-sm col-span-full" style={{ color: "rgba(22,48,43,0.5)" }}>
          No templates yet — start with the blank tile above.
        </p>
      )}
    </div>
  );
}
