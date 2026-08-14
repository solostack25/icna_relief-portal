import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import FillClient from "./FillClient";

export default async function FlierFillPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
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
        <FillClient template={template} folders={folders ?? []} />
      </div>
    </main>
  );
}
