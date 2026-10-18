import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GoalsClient from "./GoalsClient";

export const dynamic = "force-dynamic";

// Upper management sets each year's goals and budgets for the organization,
// each region and each office (same idea as IRFAS office limits). Offices
// see theirs on Insights and on their office dashboard.
export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") redirect("/admin");
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office, region, state").order("field_office");
  return (
    <GoalsClient
      offices={(offices ?? [])
        .filter((o) => o.region && o.region !== "UNASSIGNED")
        .map((o) => ({ id: o.id as string, name: o.field_office as string, region: o.region as string, state: (o.state as string) ?? "" }))}
    />
  );
}
