import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess, resolveWorkingOfficeId } from "@/lib/hungerPreventionAccess";
import { foodTotals, HP_FOOD_CATEGORIES } from "@/lib/bulkDistributions";
import BulkDistributions from "@/components/bulk/BulkDistributions";
import OfficePicker from "../OfficePicker";

export const dynamic = "force-dynamic";

const PROGRAM = "Hunger Prevention";

export default async function HungerPreventionBulkPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const access = await getHungerPreventionAccess();
  if (!access.ok) redirect("/select-app");

  const { office: officeParam } = await searchParams;
  const officeId = resolveWorkingOfficeId(access, officeParam ?? null);

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");
  const currentOffice = (offices ?? []).find((o) => o.id === officeId);

  let q = supabase
    .from("bulk_distributions")
    .select(
      "id, office_id, name, distributed_on, people_served, households_served, total_value, items_description, location, food, salesforce_synced, salesforce_error"
    )
    .eq("program", PROGRAM);
  if (officeId) q = q.eq("office_id", officeId);
  const { data: rows } = await q.order("distributed_on", { ascending: false }).limit(100);

  const year = new Date().getFullYear();
  const ytd = (rows ?? []).filter((r) => r.distributed_on >= `${year}-01-01`);
  const people = ytd.reduce((a, r) => a + (r.people_served ?? 0), 0);
  const totals = ytd.reduce(
    (a, r) => {
      const t = foodTotals(r.food);
      return { lbs: a.lbs + t.lbs, value: a.value + Number(r.total_value ?? 0) };
    },
    { lbs: 0, value: 0 }
  );
  const boxes = ytd.reduce((a, r) => a + Number(r.food?.ramadan_boxes?.qty ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}>
          Bulk Distributions
        </h1>
        <OfficePicker
          offices={offices ?? []}
          currentOfficeId={officeId}
          isAdmin={access.isAdmin}
          currentOfficeName={currentOffice?.field_office ?? null}
        />
      </div>
      <Link
        href={`/hunger-prevention${officeId ? `?office=${officeId}` : ""}`}
        className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
      >
        ← Hunger Prevention
      </Link>
      <p className="text-sm text-[var(--color-text-dim)] mt-3 mb-6">
        Food drives, partner pickups and other distributions not tied to registered clients — pounds and value by
        category ({HP_FOOD_CATEGORIES.map((c) => c.label.toLowerCase()).join(", ")}).
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: `Distributions ${year}`, value: ytd.length.toLocaleString() },
          { label: "People served", value: people.toLocaleString() },
          { label: "Pounds of food", value: Math.round(totals.lbs).toLocaleString() },
          { label: "Value", value: `$${Math.round(totals.value).toLocaleString()}${boxes ? ` · ${boxes} Ramadan boxes` : ""}` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="text-xs text-[var(--color-text-dim)]">{s.label}</div>
            <div className="text-base font-semibold mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      <BulkDistributions
        program={PROGRAM}
        rows={(rows ?? []).map((r) => ({
          ...r,
          office_name: (offices ?? []).find((o) => o.id === r.office_id)?.field_office ?? "",
        }))}
        officeId={officeId}
        offices={(offices ?? []).map((o) => ({ id: o.id, name: o.field_office }))}
        employeeId={access.employeeId}
        defaultName="Bulk Food Distribution"
        withFood
      />
    </div>
  );
}
