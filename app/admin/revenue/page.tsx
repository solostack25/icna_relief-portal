import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import RevenueClient from "./RevenueClient";

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
    { data: volunteerSignups },
    volunteerRateRaw,
  ] = await Promise.all([
    supabase.from("b2s_offices").select("id, field_office, region"),
    supabase.from("grants").select("amount, fiscal_year, office_id, region").eq("stream", "grant"),
    supabase.from("grants").select("id, title, funder_name, stream, amount, fiscal_year, office_id, region, received_date, notes").neq("stream", "grant"),
    supabase
      .from("charitystack_donation_events")
      .select("amount, event_timestamp, fundraiser_id, fundraisers(office_id)")
      .eq("status", "succeeded"),
    supabase.from("donor_call_outcomes").select("pledge_amount, called_at, caller_employee_id").not("pledge_amount", "is", null),
    supabase.from("volunteer_signups").select("qty, slot_id, volunteer_slots(start_time, end_time, event_id, volunteer_events(office_id))"),
    getIntegrationSetting("volunteer_hour_value"),
  ]);

  const volunteerHourValue = Number(volunteerRateRaw) || 33.49;
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
  const volunteerByRegion = new Map<string, number>();
  (volunteerSignups ?? []).forEach((s: any) => {
    const slot = s.volunteer_slots;
    if (!slot?.start_time || !slot?.end_time) return;
    const eventYear = new Date(slot.start_time).getFullYear();
    if (eventYear !== currentYear) return;
    const hours = (new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / (1000 * 60 * 60);
    const qty = s.qty ?? 1;
    const totalHours = hours * qty;
    volunteerHoursTotal += totalHours;
    const officeId = slot.volunteer_events?.office_id ?? null;
    const r = regionFor(officeId, null);
    volunteerByRegion.set(r, (volunteerByRegion.get(r) ?? 0) + totalHours * volunteerHourValue);
  });
  const volunteerValueTotal = volunteerHoursTotal * volunteerHourValue;

  const manualThisYear = (manualStreamRows ?? []).filter((g) => g.fiscal_year === currentYear);
  const manualByStream = new Map<string, number>();
  const manualByRegion = new Map<string, number>();
  manualThisYear.forEach((g) => {
    manualByStream.set(g.stream, (manualByStream.get(g.stream) ?? 0) + Number(g.amount));
    const r = regionFor(g.office_id, g.region);
    manualByRegion.set(r, (manualByRegion.get(r) ?? 0) + Number(g.amount));
  });

  const streams = [
    { key: "grant", label: "Grants", total: grantsTotal, byRegion: grantsByRegion, auto: true },
    { key: "general_community", label: "Community Giving", total: givingTotal, byRegion: givingByRegion, auto: true },
    { key: "calling_campaign", label: "Calling Campaign", total: pledgeTotal, byRegion: pledgeByRegion, auto: true },
    { key: "volunteering", label: "Volunteering (valued)", total: volunteerValueTotal, byRegion: volunteerByRegion, auto: true },
    ...Array.from(manualByStream.entries()).map(([key, total]) => ({
      key,
      label: STREAM_LABELS[key] ?? key,
      total,
      byRegion: new Map<string, number>(),
      auto: false,
    })),
  ];

  const totalRevenue = streams.reduce((s, st) => s + st.total, 0);
  const communityRevenue = totalRevenue - grantsTotal;

  const allRegions = new Set<string>();
  [grantsByRegion, givingByRegion, pledgeByRegion, volunteerByRegion, manualByRegion].forEach((m) => m.forEach((_, r) => allRegions.add(r)));

  return (
    <div className="max-w-4xl mx-auto p-6">
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
          manual: manualByRegion.get(r) ?? 0,
        }))}
        offices={(offices ?? []).map((o) => ({ id: o.id, field_office: o.field_office, region: o.region }))}
        currentYear={currentYear}
      />
    </div>
  );
}
