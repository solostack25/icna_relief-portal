import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TransitionalHousingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  const isDirectorOrAdmin = me?.role === "admin" || me?.role === "program_director";

  // Separate queries, merged in memory (no relational joins with the
  // sb_publishable_ key format — same pattern as everywhere else in this app).
  const [
    { data: unackedMilestones },
    { data: houses },
    { data: beds },
    { data: activeStays },
    { data: pendingReadmissions },
  ] = await Promise.all([
    supabase
      .from("th_stay_milestones")
      .select("id, milestone_type, milestone_date, stay_id")
      .is("employee_acknowledged_at", null)
      .order("milestone_date"),
    supabase.from("th_houses").select("id, name, is_active").eq("is_active", true),
    supabase.from("th_beds").select("id, house_id, label").eq("is_active", true),
    supabase
      .from("th_stays")
      .select("id, client_id, bed_id, move_in_date, expected_exit_date")
      .eq("status", "active"),
    isDirectorOrAdmin
      ? supabase.from("th_readmission_requests").select("id").eq("status", "pending")
      : Promise.resolve({ data: [] }),
  ]);

  const stayById = new Map((activeStays ?? []).map((s) => [s.id, s]));
  const clientIds = [...new Set((activeStays ?? []).map((s) => s.client_id))];
  const { data: clients } = clientIds.length
    ? await supabase.from("clients").select("id, first_name, last_name").in("id", clientIds)
    : { data: [] };
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  const occupiedBedIds = new Set((activeStays ?? []).map((s) => s.bed_id));
  const totalBeds = (beds ?? []).length;
  const openBeds = totalBeds - occupiedBedIds.size;

  const milestoneLabels: Record<string, string> = {
    "3_month_notice": "3-month notice — begin exit plan",
    "4_month_notice": "4-month notice — 2 months left",
    "5_month_final_notice": "5-month notice — 30 days to vacate",
  };

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/select-app"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← All programs
        </Link>

        <div className="flex items-center justify-between mt-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold">Transitional Housing</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {openBeds} of {totalBeds} beds open · {(activeStays ?? []).length} active stays
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/transitional-housing/admit"
              className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 hover:opacity-90"
            >
              Admit Client
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <Link
            href="/transitional-housing/houses"
            className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm hover:border-[var(--color-accent)]"
          >
            Manage houses & beds
          </Link>
          <Link
            href="/transitional-housing/readmissions"
            className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm hover:border-[var(--color-accent)] flex items-center justify-between"
          >
            Readmission requests
            {(pendingReadmissions ?? []).length > 0 && (
              <span className="rounded-full bg-[var(--color-accent-orange)] text-white text-xs font-semibold px-2 py-0.5">
                {(pendingReadmissions ?? []).length}
              </span>
            )}
          </Link>
        </div>

        <section className="rounded-xl border border-[var(--color-border)] p-6">
          <h2 className="text-sm font-medium mb-4">
            Needs Attention ({(unackedMilestones ?? []).length})
          </h2>
          {(unackedMilestones ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">
              No pending exit-plan notices right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {(unackedMilestones ?? []).map((m) => {
                const stay = stayById.get(m.stay_id);
                const client = stay ? clientById.get(stay.client_id) : null;
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                      </p>
                      <p className="text-[var(--color-text-dim)]">
                        {milestoneLabels[m.milestone_type] ?? m.milestone_type}
                        {stay ? ` · exits ${stay.expected_exit_date}` : ""}
                      </p>
                    </div>
                    {stay && (
                      <Link
                        href={`/clients/${stay.client_id}`}
                        className="shrink-0 text-xs font-medium text-[var(--color-accent)] hover:underline"
                      >
                        View client →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
