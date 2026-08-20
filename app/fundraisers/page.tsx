import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]",
  synced: "bg-green-500/10 text-green-700",
  error: "bg-red-500/10 text-red-700",
};

export default async function FundraisersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: fundraisers } = await supabase
    .from("fundraisers")
    .select("id, office_id, title, slug, goal, sync_status, is_published, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const officeIds = [...new Set((fundraisers ?? []).map((f) => f.office_id))];
  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region")
    .in("id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]);
  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));

  const ids = (fundraisers ?? []).map((f) => f.id);
  const { data: totals } = await supabase
    .from("fundraiser_totals")
    .select("fundraiser_id, raised_amount, donation_count")
    .in("fundraiser_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const totalsMap = new Map((totals ?? []).map((t) => [t.fundraiser_id, t]));

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Fundraisers</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Create fundraisers and events, powered by CharityStack
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <div className="mb-8">
          <Link
            href="/fundraisers/new"
            className="block text-center rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3"
          >
            + New Fundraiser
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {(fundraisers ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">No fundraisers yet.</p>
          ) : (
            (fundraisers ?? []).map((f) => {
              const office = officeMap.get(f.office_id);
              const totals = totalsMap.get(f.id);
              return (
                <Link
                  key={f.id}
                  href={`/fundraisers/${f.id}`}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-black/[0.02]"
                >
                  <div>
                    <div className="text-sm font-medium">{f.title}</div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {office?.field_office ?? "Unknown office"}
                      {f.goal ? ` · Goal $${Number(f.goal).toLocaleString()}` : ""}
                      {totals ? ` · $${Number(totals.raised_amount).toLocaleString()} raised (${totals.donation_count})` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"text-xs px-2 py-1 rounded-full " + (STATUS_STYLES[f.sync_status] ?? "")}>
                      {f.sync_status === "draft" ? "Not synced" : f.sync_status === "error" ? "Sync error" : "Synced"}
                    </span>
                    <span
                      className={
                        "text-xs px-2 py-1 rounded-full " +
                        (f.is_published
                          ? "bg-green-500/10 text-green-700"
                          : "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]")
                      }
                    >
                      {f.is_published ? "Published" : "Draft"}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
