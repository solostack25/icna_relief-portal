import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORTS } from "@/lib/reportsSuite/catalog";
import PowerBiCompareClient from "./PowerBiCompareClient";

export const dynamic = "force-dynamic";

// Temporary: portal numbers next to Power BI numbers, metric by metric,
// until Power BI is retired. See supabase/powerbi_compare_migration.sql
// for how to remove it afterwards.
export default async function PowerBiComparePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/admin");

  const reports = REPORTS.filter((r) => !r.href).map((r) => ({ key: r.key, title: r.title }));
  return <PowerBiCompareClient reports={reports} />;
}
