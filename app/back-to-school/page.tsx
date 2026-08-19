import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function B2SPage() {
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

  // two separate queries, merged in memory
  const { data: backpackEvents } = await supabase
    .from("b2s_submissions")
    .select(
      "id, year, month, elementary_backpacks, middle_backpacks, high_backpacks, client_id, office_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: activities } = await supabase
    .from("b2s_program_activities")
    .select("id, year, month, workshop_conducted, webinar_conducted, status, review_note, office_id, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const officeIds = [
    ...new Set([
      ...(backpackEvents ?? []).map((s) => s.office_id),
      ...(activities ?? []).map((a) => a.office_id),
    ]),
  ];
  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region")
    .in("id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]);
  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));

  const clientIds = [...new Set((backpackEvents ?? []).map((s) => s.client_id).filter(Boolean))];
  const { data: clients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, client_number")
    .in("id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Back to School</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Backpack distribution & program activity
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <div className="rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-4 py-3 text-sm mb-8">
          Backpacks are distributed from a client's profile — go to{" "}
          <Link href="/clients" className="text-[var(--color-accent)] underline">
            Clients
          </Link>{" "}
          to search for or create a client, then use "Distribute Backpack" there.
        </div>

        <div className="flex gap-3 mb-8">
          <Link
            href="/back-to-school/activity"
            className="flex-1 text-center rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3"
          >
            + Log Program Activity
          </Link>
          {me?.role === "admin" && (
            <a
              href="/api/b2s/export"
              className="flex-1 text-center rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium py-3 hover:border-[var(--color-accent)]"
            >
              Export for Power BI (CSV)
            </a>
          )}
        </div>

        <h2 className="text-sm font-medium mb-3">Recent Backpack Distributions</h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-8">
          {(backpackEvents ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">None yet.</p>
          ) : (
            (backpackEvents ?? []).map((s) => {
              const office = officeMap.get(s.office_id);
              const client = s.client_id ? clientMap.get(s.client_id) : null;
              const total = (s.elementary_backpacks ?? 0) + (s.middle_backpacks ?? 0) + (s.high_backpacks ?? 0);
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {client ? (
                        <Link href={`/clients/${client.id}`} className="hover:underline">
                          {client.first_name} {client.last_name}
                        </Link>
                      ) : (
                        "Unlinked entry"
                      )}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {office?.field_office ?? "Unknown office"} · {MONTH_NAMES[s.month]} {s.year} ·{" "}
                      {total} backpack{total !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <h2 className="text-sm font-medium mb-3">Recent Program Activity</h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {(activities ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">None yet.</p>
          ) : (
            (activities ?? []).map((a) => {
              const office = officeMap.get(a.office_id);
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {office?.field_office ?? "Unknown office"}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {MONTH_NAMES[a.month]} {a.year}
                      {a.workshop_conducted ? " · Workshop" : ""}
                      {a.webinar_conducted ? " · Webinar" : ""}
                    </div>
                    {a.status === "flagged" && a.review_note && (
                      <div className="text-xs text-[#B55139] mt-1">⚠ {a.review_note}</div>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-text-dim)] capitalize">{a.status}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
