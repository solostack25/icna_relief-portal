import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInsightsAccess } from "@/lib/insightsAccess";
import InsightsClient from "./InsightsClient";

export const dynamic = "force-dynamic";

// Organization-wide reporting dashboard: every program's numbers in one
// place, filterable by date, region, office and program, with drill-down
// and CSV download. Regional directors see their region; area managers see
// only their own office (and the goals & budget set for it).
export default async function InsightsPage() {
  const access = await getInsightsAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/admin");

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office, region, state").order("field_office");
  const list = (offices ?? [])
    .filter((o) => (!access.lockedRegion || o.region === access.lockedRegion) && (!access.lockedOffice || o.id === access.lockedOffice))
    .map((o) => ({ id: o.id as string, name: (o.field_office as string) ?? "—", region: (o.region as string) ?? "UNASSIGNED", state: (o.state as string) ?? "" }));

  return <InsightsClient offices={list} lockedRegion={access.lockedRegion} lockedOffice={access.lockedOffice} />;
}
