import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GrantsClient from "./GrantsClient";

export default async function GrantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  const [{ data: grants }, { data: goals }, { data: offices }] = await Promise.all([
    supabase.from("grants").select("id, title, funder_name, program, office_id, region, amount, fiscal_year, received_date, notes").eq("stream", "grant"),
    supabase.from("grant_region_goals").select("id, region, fiscal_year, goal_amount"),
    supabase.from("b2s_offices").select("id, field_office, region, chapter, state").eq("is_active", true).order("field_office"),
  ]);

  const officeById = new Map((offices ?? []).map((o) => [o.id, o]));

  const resolvedGrants = (grants ?? []).map((g) => {
    const office = g.office_id ? officeById.get(g.office_id) : null;
    return {
      ...g,
      resolvedRegion: office?.region ?? g.region ?? "Unassigned",
      chapter: office?.chapter ?? null,
      state: office?.state ?? null,
      fieldOffice: office?.field_office ?? null,
    };
  });

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Grants
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Institutional and foundation grant revenue by region and program.
      </p>
      <GrantsClient grants={resolvedGrants} goals={goals ?? []} offices={offices ?? []} />
    </div>
  );
}
