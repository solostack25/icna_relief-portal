import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ReviewForm from "./ReviewForm";

const PROGRAM_TABLES: Record<string, string> = {
  b2s: "b2s_submissions",
  fate: "fate_submissions",
  drs: "drs_submissions",
};

const PROGRAM_LABELS: Record<string, string> = {
  b2s: "Back to School",
  fate: "F.A.T.E.",
  drs: "D.R.S.",
};

const HIDDEN_FIELDS = new Set([
  "id", "office_id", "employee_id", "status", "reviewed_by", "reviewed_at", "review_note",
]);

function formatLabel(key: string) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ program: string; id: string }>;
}) {
  const { program, id } = await params;
  const table = PROGRAM_TABLES[program];
  if (!table) redirect("/admin/review");

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
  const allowedRoles = ["admin", "regional_director", "program_director"];
  if (!me || !allowedRoles.includes(me.role)) redirect("/select-app");

  const { data: submission } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .single();

  if (!submission) redirect("/admin/review");

  const { data: office } = await supabase
    .from("b2s_offices")
    .select("field_office, region")
    .eq("id", submission.office_id)
    .single();

  const fieldEntries = Object.entries(submission).filter(
    ([key, value]) => !HIDDEN_FIELDS.has(key) && value !== null && value !== "" && value !== 0 && value !== false
  );

  return (
    <div>
      <Link
        href={`/admin/review?program=${program}`}
        className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
      >
        ← Back to review list
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-xl font-semibold">
          {PROGRAM_LABELS[program]} Submission
        </h1>
        <p className="text-sm text-[var(--color-text-dim)]">
          {office?.field_office} ({office?.region}) · {submission.month}/{submission.year}
        </p>
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">Submitted Data</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            {fieldEntries.map(([key, value]) => (
              <>
                <dt key={key + "-label"} className="text-[var(--color-text-dim)]">
                  {formatLabel(key)}
                </dt>
                <dd key={key + "-value"}>{String(value)}</dd>
              </>
            ))}
          </dl>
          {fieldEntries.length === 0 && (
            <p className="text-sm text-[var(--color-text-dim)]">
              No non-empty fields to show (likely a "no activity" check-in).
            </p>
          )}
        </section>

        {submission.review_note && (
          <section className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6 mb-6">
            <h2 className="text-sm font-medium mb-2 text-yellow-500">
              Existing Review Note
            </h2>
            <p className="text-sm">{submission.review_note}</p>
          </section>
        )}

        <ReviewForm
          program={program}
          submissionId={id}
          currentStatus={submission.status}
        />
    </div>
  );
}
