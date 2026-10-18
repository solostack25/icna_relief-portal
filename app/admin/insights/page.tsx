import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReportsAccess } from "@/lib/reportsAccess";
import InsightsClient from "./InsightsClient";

export const dynamic = "force-dynamic";

// Organization-wide reporting dashboard: every program's numbers in one
// place, filterable by date, region, office and program, with drill-down
// and CSV download. Replaces building these views in Power BI from the
// Master Cleaner output.
export default async function InsightsPage() {
  const access = await getReportsAccess();
  if (!access.ok) redirect("/");
  const allowed = access.isAdmin || access.role === "program_director" || (access.role === "regional_director" && !!access.assignedRegion);
  if (!allowed) redirect("/admin");

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office, region, state").order("field_office");

  const lockedRegion = access.role === "regional_director" ? access.assignedRegion : null;
  const list = (offices ?? [])
    .filter((o) => !lockedRegion || o.region === lockedRegion)
    .map((o) => ({ id: o.id as string, name: (o.field_office as string) ?? "—", region: (o.region as string) ?? "UNASSIGNED", state: (o.state as string) ?? "" }));

  return <InsightsClient offices={list} lockedRegion={lockedRegion} />;
}
