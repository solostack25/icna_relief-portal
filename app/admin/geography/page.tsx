import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ensureZipListLoaded } from "@/lib/geo/zipOffices";
import GeographyClient from "./GeographyClient";

export const dynamic = "force-dynamic";

// Address → office rules (moved over from the Master Cleaner). Used to give
// each office credit for donations synced from Salesforce, and anywhere else
// an address needs to land in an office.
export default async function GeographyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  await ensureZipListLoaded();

  const admin = createAdminClient();
  const [{ data: offices }, { data: splits }, { data: aliases }] = await Promise.all([
    admin.from("b2s_offices").select("id, field_office, state").eq("is_active", true).order("state").order("field_office"),
    admin.from("geo_split_states").select("state, default_office_id").order("state"),
    admin.from("geo_region_aliases").select("alias, office_id").order("alias"),
  ]);
  const { count: zipCount } = await admin.from("geo_zip_offices").select("id", { count: "exact", head: true });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Zip → Office Map
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        How an address is assigned to an office — the same rules the Master Cleaner used. States with one office go to that
        office. CA, TX, FL, VA and MO are split between offices by zip code, then city, then a default office. Salesforce&apos;s
        contact &quot;Region&quot; values are checked first when a donation has one.
      </p>
      <GeographyClient
        offices={(offices ?? []).map((o: any) => ({ id: o.id, name: o.field_office, state: o.state }))}
        splits={(splits ?? []) as { state: string; default_office_id: string }[]}
        aliases={(aliases ?? []) as { alias: string; office_id: string }[]}
        zipCount={zipCount ?? 0}
      />
    </div>
  );
}
