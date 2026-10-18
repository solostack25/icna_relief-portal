import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ALL_FOOD_ITEM_CODES, HP_FOOD_CATEGORIES } from "@/lib/bulkDistributions";
import RatesClient from "./RatesClient";
import ServiceTypesEditor from "@/app/refugee-services/service-types/ServiceTypesEditor";

export const dynamic = "force-dynamic";

// One place for the dollar values the portal uses in reports, which change
// from time to time: food prices (shared with the in-kind price list),
// volunteer hour value (dated), and Refugee Services service values.
export default async function RatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  const admin = createAdminClient();
  const [{ data: items }, { data: rates }, { data: types }] = await Promise.all([
    admin.from("items").select("code, name, new_price, active, updated_at").in("code", ALL_FOOD_ITEM_CODES),
    supabase.from("volunteer_hour_rates").select("effective_from, rate").order("effective_from", { ascending: false }),
    supabase.from("rsce_service_types").select("id, name, category, default_value, is_active, sort_order").order("sort_order").order("name"),
  ]);

  type Item = { code: string; name: string; new_price: number | null; active: boolean; updated_at: string | null };
  const food = HP_FOOD_CATEGORIES.map((c) => {
    const item = (c.itemCodes as readonly string[])
      .map((code) => ((items ?? []) as Item[]).find((i) => i.code === code && i.active && i.new_price != null))
      .find(Boolean);
    return {
      key: c.key,
      label: c.label,
      unit: c.unit,
      price: item ? Number(item.new_price) : null,
      itemName: item?.name ?? null,
      updatedAt: item?.updated_at ?? null,
      priced: c.itemCodes.length > 0,
    };
  });

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Rates &amp; Values
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        The dollar values used across the portal&apos;s programs and Power BI exports. Changes apply to anything recorded from now
        on — records already saved keep the value they were recorded with.
      </p>

      <RatesClient
        food={food}
        volunteerRates={(rates ?? []).map((r) => ({ effective_from: r.effective_from, rate: Number(r.rate) }))}
      />

      <section className="mt-10">
        <h2 className="text-base font-semibold mb-1">Refugee Services service values</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.55)" }}>
          Default dollar value pre-filled when staff log each service. Leave blank for services where staff enter the value.
        </p>
        <ServiceTypesEditor
          initial={(types ?? []).map((t) => ({ ...t, default_value: t.default_value === null ? null : Number(t.default_value) }))}
        />
      </section>
    </div>
  );
}
