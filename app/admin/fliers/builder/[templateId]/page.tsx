import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import BuilderClient from "./BuilderClient";

export default async function TemplateEditorPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const access = await getFlierMarketingAccess();
  if (!access.ok) redirect("/select-app");

  const supabase = await createClient();
  const { data: template } = await supabase.from("flier_templates").select("*").eq("id", templateId).single();
  if (!template) notFound();

  return (
    <div>
      <Link href="/admin/fliers/builder" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
        ← All Templates
      </Link>
      <BuilderClient template={template} />
    </div>
  );
}
