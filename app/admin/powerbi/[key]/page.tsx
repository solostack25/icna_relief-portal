import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORT } from "@/lib/reportsSuite/catalog";
import { isMapped } from "@/lib/powerbiReports/engine";
import { PBI_REPORTS } from "@/lib/powerbiReports/specs";
import ReportView from "@/app/admin/insights/reports/[key]/ReportView";

export const dynamic = "force-dynamic";

// A report exactly as on Standard reports, but drawn from Power BI.
export default async function PowerBiReportPage({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const def = REPORT.get(key);
  if (!def || !isMapped(key)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/admin");

  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office, region, state").order("field_office");
  const list = (offices ?? [])
    .filter((o) => o.region && o.region !== "UNASSIGNED")
    .map((o) => ({ id: o.id as string, name: o.field_office as string, region: o.region as string, state: (o.state as string) ?? "" }));

  return (
    <ReportView
      reportKey={key}
      offices={list}
      lockedRegion={null}
      lockedOffice={null}
      source="powerbi"
      filters={PBI_REPORTS[key]?.filters ?? (def.href ? ["year", "month", "region", "state", "office"] : undefined)}
    />
  );
}
