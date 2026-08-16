import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import FillClient from "./FillClient";

export default async function FlierFillPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { templateId } = await params;
  const { draft: draftId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: template } = await supabase
    .from("flier_templates")
    .select("*")
    .eq("id", templateId)
    .eq("is_active", true)
    .single();
  if (!template) notFound();

  // If opened from a prefilled draft (e.g. generated via the API for
  // a future Copilot action), merge those values into the canvas
  // before rendering - the person still lands in the normal Fill UI
  // to review/adjust before anything is finalized, nothing here
  // auto-publishes.
  if (draftId) {
    const { data: draft } = await supabase
      .from("flier_drafts")
      .select("values, template_id")
      .eq("id", draftId)
      .single();

    if (draft && draft.template_id === templateId && template.canvas_data) {
      type DraftValue = string | { imageUrl: string; dropboxPath?: string };
      const values = draft.values as Record<string, DraftValue>;
      template.canvas_data = (template.canvas_data as Record<string, unknown>[]).map((el) => {
        const value = values[el.id as string];
        if (value === undefined) return el;
        if (typeof value === "string") return { ...el, text: value };
        return { ...el, imageUrl: value.imageUrl, dropboxPath: value.dropboxPath ?? null };
      });
    }
  }

  const { data: folders } = await supabase
    .from("content_folders")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-10 py-6">
        <Link href="/fliers" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          ← All Templates
        </Link>
        {draftId && (
          <div className="mt-3 mb-1 text-xs px-3 py-2 rounded" style={{ background: "rgba(31,111,84,0.08)", color: "var(--portal-emerald)" }}>
            Prefilled from a draft — review everything below before saving or downloading.
          </div>
        )}
        <FillClient template={template} folders={folders ?? []} />
      </div>
    </main>
  );
}
