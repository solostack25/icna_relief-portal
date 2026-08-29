import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceTicketDetailClient from "./FinanceTicketDetailClient";

export default async function FinanceTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");

  return (
    <div className="max-w-2xl mx-auto p-6">
      <FinanceTicketDetailClient id={id} offices={offices ?? []} />
    </div>
  );
}
