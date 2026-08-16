import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import PortalHeader from "@/app/PortalHeader";
import BuilderClient from "./BuilderClient";

export default async function TemplateEditorPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const access = await getFlierMarketingAccess();
  if (!access.ok) redirect("/select-app");

  const supabase = await createClient();
  const { data: template } = await supabase.from("flier_templates").select("*").eq("id", templateId).single();
  if (!template) notFound();

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-10 py-6">
        <Link href="/admin/fliers/builder" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          ← All Templates
        </Link>
        <BuilderClient template={template} />
      </div>
    </main>
  );
}
