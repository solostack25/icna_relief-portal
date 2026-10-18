import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInsightsAccess } from "@/lib/insightsAccess";
import { REPORT } from "@/lib/reportsSuite/catalog";
import ReportView from "./ReportView";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = REPORT.get(key);
  if (!def || def.href) notFound();
  const access = await getInsightsAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/admin");

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office, region, state").order("field_office");
  const list = (offices ?? [])
    .filter((o) => o.region && o.region !== "UNASSIGNED")
    .filter((o) => (!access.lockedRegion || o.region === access.lockedRegion) && (!access.lockedOffice || o.id === access.lockedOffice))
    .map((o) => ({ id: o.id as string, name: o.field_office as string, region: o.region as string, state: (o.state as string) ?? "" }));

  return <ReportView reportKey={key} offices={list} lockedRegion={access.lockedRegion} lockedOffice={access.lockedOffice} />;
}
