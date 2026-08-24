import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExecDashboardClient from "./ExecDashboardClient";

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };

export default async function ExecDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  const [
    { count: totalClients },
    { data: b2sRows },
    { count: totalPickupsCompleted },
    { count: activeThStays },
    { data: thStayRows },
    { count: totalVolunteerSignups },
    { count: activeFundraisers },
    { data: donationRows },
    { data: pledgeRows },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("b2s_client_distributions").select("backpacks_distributed"),
    supabase.from("pickup_bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("th_stays").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("th_stays").select("move_in_date, vacated_at, status"),
    supabase.from("volunteer_signups").select("id", { count: "exact", head: true }),
    supabase.from("fundraisers").select("id", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("charitystack_donation_events").select("amount").eq("status", "succeeded"),
    supabase.from("donor_call_outcomes").select("pledge_amount").not("pledge_amount", "is", null),
  ]);

  const totalBackpacks = (b2sRows ?? []).reduce((sum, r) => sum + (r.backpacks_distributed ?? 0), 0);
  const totalDonations = (donationRows ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const totalPledges = (pledgeRows ?? []).reduce((sum, r) => sum + Number(r.pledge_amount ?? 0), 0);

  const today = new Date();
  const totalBedNights = (thStayRows ?? []).reduce((sum, r) => {
    const start = new Date(r.move_in_date);
    const end = r.vacated_at ? new Date(r.vacated_at) : today;
    const nights = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return sum + nights;
  }, 0);

  const { data: assumptions } = await supabase.from("exec_scenario_assumptions").select("*").order("program_key");
  const { data: updaters } = assumptions?.length
    ? await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .in("id", assumptions.filter((a) => a.updated_by).map((a) => a.updated_by))
    : { data: [] };
  const updaterById = new Map((updaters ?? []).map((e) => [e.id, e]));

  const kpis = [
    { label: "Total Raised", value: `$${(totalDonations + totalPledges).toLocaleString()}`, sub: `${activeFundraisers ?? 0} active campaigns`, color: "#2F6D46" },
    { label: "Clients Served (all-time)", value: (totalClients ?? 0).toLocaleString(), sub: "across every program", color: "#3E7FBF" },
    { label: "Backpacks Distributed", value: totalBackpacks.toLocaleString(), sub: "Back to School", color: "#E2892F" },
    { label: "Family Pickups Completed", value: (totalPickupsCompleted ?? 0).toLocaleString(), sub: "Hunger Prevention", color: "#8A5FB5" },
    { label: "Transitional Housing", value: (activeThStays ?? 0).toLocaleString(), sub: `${totalBedNights.toLocaleString()} bed-nights all-time`, color: "#B5566B" },
    { label: "Volunteer Signups", value: (totalVolunteerSignups ?? 0).toLocaleString(), sub: "shifts filled", color: "#3E9E8F" },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Executive Dashboard
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Organization-wide impact, and a what-if calculator for planning around future fundraising.
      </p>

      <div className="grid gap-4 mb-10" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ ...cardStyle, padding: "20px 22px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#16302B" }}>{k.value}</div>
            <div className="text-xs font-semibold mt-1" style={{ color: k.color }}>
              {k.label}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "rgba(22,48,43,0.4)" }}>
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      <ExecDashboardClient
        assumptions={(assumptions ?? []).map((a) => ({
          ...a,
          updaterName: a.updated_by ? `${updaterById.get(a.updated_by)?.first_name ?? ""} ${updaterById.get(a.updated_by)?.last_name ?? ""}`.trim() : null,
        }))}
      />
    </div>
  );
}
