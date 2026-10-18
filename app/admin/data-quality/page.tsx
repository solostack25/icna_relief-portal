import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DataQualityClient from "./DataQualityClient";

export const dynamic = "force-dynamic";

// Continuous version of what the Master Cleaner did after the fact: every
// record that would have needed cleaning, grouped by problem, with a fix.
export default async function DataQualityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") redirect("/admin");

  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office, region").order("field_office");
  return (
    <DataQualityClient
      offices={(offices ?? []).map((o) => ({ id: o.id as string, name: (o.field_office as string) ?? "—", region: (o.region as string) ?? "" }))}
    />
  );
}
