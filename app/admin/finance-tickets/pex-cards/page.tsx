import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import { createClient } from "@/lib/supabase/server";
import PexCardsAdminClient from "./PexCardsAdminClient";

export default async function PexCardsAdminPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
        Cards actually issued to staff. Needed before a PEX Recharge Request can reference a specific card.
      </p>
      <PexCardsAdminClient offices={offices ?? []} />
    </div>
  );
}
