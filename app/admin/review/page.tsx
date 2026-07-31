import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PROGRAMS = [
  { slug: "b2s", label: "Back to School", table: "b2s_submissions" },
  { slug: "fate", label: "F.A.T.E.", table: "fate_submissions" },
  { slug: "drs", label: "D.R.S.", table: "drs_submissions" },
] as const;

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; status?: string }>;
}) {
  const { program: programParam, status: statusParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/select-app");

  const activeProgram = PROGRAMS.find((p) => p.slug === programParam) ?? PROGRAMS[0];
  const activeStatus = statusParam ?? "submitted";

  let query = supabase
    .from(activeProgram.table)
    .select("id, year, month, status, office_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  const { data: submissions } = await query;

  const officeIds = [...new Set((submissions ?? []).map((s: any) => s.office_id))];
  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region")
    .in("id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]);

  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));

  function tabHref(program: string, status: string) {
    return `/admin/review?program=${program}&status=${status}`;
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Review Submissions</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Mark field submissions reviewed, or flag issues back to the office
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Admin
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          {PROGRAMS.map((p) => (
            <Link
              key={p.slug}
              href={tabHref(p.slug, activeStatus)}
              className={`text-sm px-3 py-1.5 rounded-lg border ${
                p.slug === activeProgram.slug
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)]"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>

        <div className="flex gap-2 mb-8">
          {["submitted", "reviewed", "flagged", "all"].map((s) => (
            <Link
              key={s}
              href={tabHref(activeProgram.slug, s)}
              className={`text-xs px-3 py-1 rounded-full border capitalize ${
                s === activeStatus
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)]"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {(submissions ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              Nothing here.
            </p>
          ) : (
            (submissions ?? []).map((s: any) => {
              const office = officeMap.get(s.office_id);
              return (
                <Link
                  key={s.id}
                  href={`/admin/review/${activeProgram.slug}/${s.id}`}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-black/20"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {office?.field_office ?? "Unknown office"}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {MONTH_NAMES[s.month]} {s.year}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-text-dim)] capitalize">
                    {s.status}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
