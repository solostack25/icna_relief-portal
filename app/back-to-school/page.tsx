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
  const { data: submissions } = await supabase
    .from("b2s_submissions")
    .select(
      "id, year, month, distribution_city, elementary_backpacks, middle_backpacks, high_backpacks, status, office_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const officeIds = [...new Set((submissions ?? []).map((s) => s.office_id))];
  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region")
    .in("id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]);

  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Back to School</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Monthly activity submissions
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <div className="flex gap-3 mb-8">
          <Link
            href="/back-to-school/new"
            className="flex-1 text-center rounded-lg bg-[var(--color-accent)] text-black text-sm font-medium py-3"
          >
            + New Submission
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

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {(submissions ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              No submissions yet.
            </p>
          ) : (
            (submissions ?? []).map((s) => {
              const office = officeMap.get(s.office_id);
              const totalBackpacks =
                (s.elementary_backpacks ?? 0) +
                (s.middle_backpacks ?? 0) +
                (s.high_backpacks ?? 0);
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {office?.field_office ?? "Unknown office"}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {MONTH_NAMES[s.month]} {s.year}
                      {s.distribution_city ? ` · ${s.distribution_city}` : ""}
                      {totalBackpacks ? ` · ${totalBackpacks} backpacks` : ""}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-text-dim)] capitalize">
                    {s.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
