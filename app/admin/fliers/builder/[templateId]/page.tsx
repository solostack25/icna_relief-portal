import { redirect, notFound } from "next/navigation";
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
    <BuilderClient template={template} />
  );
}
