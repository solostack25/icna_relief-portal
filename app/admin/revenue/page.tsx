import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RevenueClient from "./RevenueClient";
import SalesforceRevenueCard from "./SalesforceRevenueCard";

const STREAM_LABELS: Record<string, string> = {
  in_kind: "In-Kind Donation",
  irfas: "IRFAS",
  ramadan: "Ramadan",
  outreach: "Outreach",
  general_community: "General Community",
};

export default async function RevenuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  const [
    { data: offices },
    { data: grantStreamRows },
    { data: manualStreamRows },
    { data: donationRows },
    { data: pledgeRows },
    { data: volunteerHourRows },
    { data: squarePaymentRows },
    { data: hourRates },
  ] = await Promise.all([
    supabase.from("b2s_offices").select("id, field_office, region"),
    supabase.from("grants").select("amount, fiscal_year, office_id, region").eq("stream", "grant"),
    supabase.from("grants").select("id, title, funder_name, stream, amount, fiscal_year, office_id, region, received_date, notes").neq("stream", "grant"),
    supabase
      .from("charitystack_donation_events")
      .select("amount, event_timestamp, fundraiser_id, fundraisers(office_id)")
      .eq("status", "succeeded"),
    supabase.from("donor_call_outcomes").select("pledge_amount, called_at, caller_employee_id").not("pledge_amount", "is", null),
    // Actual attended hours (check-in → check-out), each valued at the
    // hourly rate in effect on the day served.
    supabase
      .from("volunteer_hours")
      .select("hours, value, service_date, office_id")
      .gte("service_date", `${new Date().getFullYear()}-01-01`)
      .lte("service_date", `${new Date().getFullYear()}-12-31`)
      .not("checked_out_at", "is", null),
    supabase.from("square_payments").select("amount, square_created_at, office_id, status").eq("status", "COMPLETED"),
    supabase.from("volunteer_hour_rates").select("effective_from, rate").order("effective_from", { ascending: false }).limit(1),
  ]);

  const volunteerHourValue = Number(hourRates?.[0]?.rate ?? 0);
  const officeById = new Map((offices ?? []).map((o) => [o.id, o]));

  const callerIds = [...new Set((pledgeRows ?? []).map((p) => p.caller_employee_id).filter(Boolean))] as string[];
  const { data: callerEmployees } = callerIds.length
    ? await supabase.from("employees").select("id, assigned_office_id").in("id", callerIds)
    : { data: [] };
  const officeByEmployee = new Map((callerEmployees ?? []).map((e) => [e.id, e.assigned_office_id]));

  function regionFor(officeId: string | null, fallbackRegion: string | null): string {
    if (officeId) return officeById.get(officeId)?.region ?? "Unassigned";
    return fallbackRegion ?? "Unassigned";
  }

  const currentYear = new Date().getFullYear();

  const grantsThisYear = (grantStreamRows ?? []).filter((g) => g.fiscal_year === currentYear);
  const grantsTotal = grantsThisYear.reduce((s, g) => s + Number(g.amount), 0);
  const grantsByRegion = new Map<string, number>();
  grantsThisYear.forEach((g) => {
    const r = regionFor(g.office_id, g.region);
    grantsByRegion.set(r, (grantsByRegion.get(r) ?? 0) + Number(g.amount));
  });

  const givingThisYear = (donationRows ?? []).filter((d) => new Date(d.event_timestamp).getFullYear() === currentYear);
  const givingTotal = givingThisYear.reduce((s, d) => s + Number(d.amount), 0);
  const givingByRegion = new Map<string, number>();
  givingThisYear.forEach((d: any) => {
    const r = regionFor(d.fundraisers?.office_id ?? null, null);
    givingByRegion.set(r, (givingByRegion.get(r) ?? 0) + Number(d.amount));
  });

  const pledgesThisYear = (pledgeRows ?? []).filter((p) => p.called_at && new Date(p.called_at).getFullYear() === currentYear);
  const pledgeTotal = pledgesThisYear.reduce((s, p) => s + Number(p.pledge_amount), 0);
  const pledgeByRegion = new Map<string, number>();
  pledgesThisYear.forEach((p) => {
    const officeId = p.caller_employee_id ? officeByEmployee.get(p.caller_employee_id) ?? null : null;
    const r = regionFor(officeId, null);
    pledgeByRegion.set(r, (pledgeByRegion.get(r) ?? 0) + Number(p.pledge_amount));
  });

  let volunteerHoursTotal = 0;
  let volunteerValueTotal = 0;
  const volunteerByRegion = new Map<string, number>();
  (volunteerHourRows ?? []).forEach((h: any) => {
    volunteerHoursTotal += Number(h.hours ?? 0);
    volunteerValueTotal += Number(h.value ?? 0);
    const r = regionFor(h.office_id ?? null, null);
    volunteerByRegion.set(r, (volunteerByRegion.get(r) ?? 0) + Number(h.value ?? 0));
  });

  const manualThisYear = (manualStreamRows ?? []).filter((g) => g.fiscal_year === currentYear);
  const manualByStream = new Map<string, number>();
  const manualByRegion = new Map<string, number>();
  manualThisYear.forEach((g) => {
    manualByStream.set(g.stream, (manualByStream.get(g.stream) ?? 0) + Number(g.amount));
    const r = regionFor(g.office_id, g.region);
    manualByRegion.set(r, (manualByRegion.get(r) ?? 0) + Number(g.amount));
  });

  const squareThisYear = (squarePaymentRows ?? []).filter((p) => new Date(p.square_created_at).getFullYear() === currentYear);
  const squareTotal = squareThisYear.reduce((s, p) => s + Number(p.amount), 0);
  const squareByRegion = new Map<string, number>();
  squareThisYear.forEach((p) => {
    const r = regionFor(p.office_id, null);
    squareByRegion.set(r, (squareByRegion.get(r) ?? 0) + Number(p.amount));
  });

  const streams = [
    { key: "grant", label: "Grants", total: grantsTotal, byRegion: grantsByRegion, auto: true },
    { key: "general_community", label: "Community Giving", total: givingTotal, byRegion: givingByRegion, auto: true },
    { key: "calling_campaign", label: "Calling Campaign", total: pledgeTotal, byRegion: pledgeByRegion, auto: true },
    { key: "volunteering", label: "Volunteering (valued)", total: volunteerValueTotal, byRegion: volunteerByRegion, auto: true },
    { key: "square", label: "Square (Event / Pantry Payments)", total: squareTotal, byRegion: squareByRegion, auto: true },
    ...Array.from(manualByStream.entries()).map(([key, total]) => ({
      key,
      label: STREAM_LABELS[key] ?? key,
      total,
      byRegion: new Map<string, number>(),
      auto: false,
    })),
  ];

  // Donations synced from Salesforce (revenue_transactions). Shown in their
  // own card for now so nothing is counted twice with the streams above
  // (CharityStack / Square gifts also reach Salesforce).
  const [{ data: sfRows }, { data: lastRuns }] = await Promise.all([
    supabase
      .from("revenue_transactions")
      .select("amount, program, office_id")
      .gte("received_on", `${currentYear}-01-01`)
      .lte("received_on", `${currentYear}-12-31`)
      .limit(50000),
    supabase.from("revenue_sync_runs").select("status, started_at, rows_upserted, error").order("started_at", { ascending: false }).limit(1),
  ]);
  const sfByProgram = new Map<string, number>();
  const sfByOffice = new Map<string, number>();
  let sfTotal = 0;
  let sfUnassigned = 0;
  (sfRows ?? []).forEach((r: any) => {
    const amt = Number(r.amount);
    sfTotal += amt;
    sfByProgram.set(r.program || "Unspecified", (sfByProgram.get(r.program || "Unspecified") ?? 0) + amt);
    const office = r.office_id ? officeById.get(r.office_id)?.field_office ?? "Unassigned" : "Unassigned";
    if (office === "Unassigned") sfUnassigned += amt;
    sfByOffice.set(office, (sfByOffice.get(office) ?? 0) + amt);
  });

  const totalRevenue = streams.reduce((s, st) => s + st.total, 0);
  const communityRevenue = totalRevenue - grantsTotal;

  const allRegions = new Set<string>();
  [grantsByRegion, givingByRegion, pledgeByRegion, volunteerByRegion, squareByRegion, manualByRegion].forEach((m) => m.forEach((_, r) => allRegions.add(r)));

  return (
    <div className="max-w-4xl">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Revenue
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        {currentYear} total revenue across every stream — Grants and Community Revenue combined. Streams marked
        &quot;auto&quot; are pulled live from data already in the portal (donations, pledges, volunteer hours);
        the rest are entered manually below until they have a native source too.
      </p>

      <RevenueClient
        totalRevenue={totalRevenue}
        communityRevenue={communityRevenue}
        grantsTotal={grantsTotal}
        volunteerHoursTotal={volunteerHoursTotal}
        volunteerHourValue={volunteerHourValue}
        streams={streams.map((s) => ({ key: s.key, label: s.label, total: s.total, auto: s.auto }))}
        byRegionStack={Array.from(allRegions).map((r) => ({
          region: r,
          grants: grantsByRegion.get(r) ?? 0,
          giving: givingByRegion.get(r) ?? 0,
          calling: pledgeByRegion.get(r) ?? 0,
          volunteering: volunteerByRegion.get(r) ?? 0,
          square: squareByRegion.get(r) ?? 0,
          manual: manualByRegion.get(r) ?? 0,
        }))}
        offices={(offices ?? []).map((o) => ({ id: o.id, field_office: o.field_office, region: o.region }))}
        currentYear={currentYear}
      />

      <SalesforceRevenueCard
        year={currentYear}
        lastRun={(lastRuns ?? [])[0] ?? null}
        total={sfTotal}
        count={(sfRows ?? []).length}
        byProgram={[...sfByProgram.entries()].map(([program, total]) => ({ program, total })).sort((a, b) => b.total - a.total)}
        byOffice={[...sfByOffice.entries()].map(([office, total]) => ({ office, total })).sort((a, b) => b.total - a.total)}
        unassigned={sfUnassigned}
      />
    </div>
  );
}
