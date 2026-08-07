import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HousesManager from "./HousesManager";

export default async function HousesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: houses }, { data: beds }, { data: activeStays }, { data: offices }] =
    await Promise.all([
      supabase.from("th_houses").select("id, name, address, office_id, is_active").order("name"),
      supabase.from("th_beds").select("id, house_id, label, is_active").order("label"),
      supabase.from("th_stays").select("bed_id").eq("status", "active"),
      supabase.from("b2s_offices").select("id, field_office").order("field_office"),
    ]);

  const occupiedBedIds = new Set((activeStays ?? []).map((s) => s.bed_id));

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/transitional-housing"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Transitional Housing
        </Link>
        <h1 className="text-xl font-semibold mt-4 mb-6">Houses & Beds</h1>

        <HousesManager
          initialHouses={houses ?? []}
          initialBeds={beds ?? []}
          occupiedBedIds={[...occupiedBedIds]}
          offices={offices ?? []}
        />
      </div>
    </main>
  );
}
