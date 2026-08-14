"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Template = { id: string; name: string; category: string | null; is_active: boolean; updated_at: string };

export default function TemplatesListClient() {
  const supabase = createClient();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data } = await supabase.from("flier_templates").select("id, name, category, is_active, updated_at").order("updated_at", { ascending: false });
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
    if (!error && data) router.push(`/marketing/fliers/builder/${data.id}`);
  }

  async function toggleActive(t: Template) {
    await supabase.from("flier_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  if (!templates) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div>
      <div className="space-y-2 mb-6">
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-xl bg-white px-5 py-4"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            <div>
              <Link href={`/marketing/fliers/builder/${t.id}`} className="text-sm font-bold hover:underline">
                {t.name}
              </Link>
              <div className="text-[11px] mt-0.5" style={{ color: "rgba(22,48,43,0.45)" }}>
                {t.category ?? "Uncategorized"} · {t.is_active ? "Published" : "Draft"} · Updated{" "}
                {new Date(t.updated_at).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleActive(t)} className="text-xs cursor-pointer" style={{ color: "rgba(22,48,43,0.5)" }}>
                {t.is_active ? "Unpublish" : "Publish"}
              </button>
              <Link href={`/marketing/fliers/builder/${t.id}`} className="text-xs font-medium" style={{ color: "var(--portal-emerald)" }}>
                Edit →
              </Link>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No templates yet.
          </p>
        )}
      </div>

      <button
        onClick={createNew}
        disabled={creating}
        className="text-sm px-4 py-2 rounded-lg text-white font-medium cursor-pointer disabled:opacity-50"
        style={{ background: "var(--portal-emerald)" }}
      >
        {creating ? "Creating…" : "+ New Template"}
      </button>
    </div>
  );
}
