import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdMappingsPage() {
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

  const { data: mappings } = await supabase
    .from("ad_role_mappings")
    .select("*")
    .order("ad_group_name");

  const { data: recentSyncs } = await supabase
    .from("ad_sync_log")
    .select("ran_at, field_changed, old_value, new_value, employee_id")
    .order("ran_at", { ascending: false })
    .limit(20);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">AD Role Mappings</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Which AD Security Groups grant which portal access
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-8">
        <Link
          href="/admin/ad-mappings/new"
          className="flex-1 text-center rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3"
        >
          + Add Mapping
        </Link>
        <form action="/api/admin/ad-sync" method="POST" className="flex-1">
          <button
            formTarget="_blank"
            className="w-full rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium py-3 hover:border-[var(--color-accent)]"
          >
            Run Sync Now
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-8">
        {(mappings ?? []).length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-dim)]">
            No mappings yet — add one to start driving access from AD groups.
          </p>
        ) : (
          (mappings ?? []).map((m: any) => (
            <Link
              key={m.id}
              href={`/admin/ad-mappings/${m.id}`}
              className="block px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-black/5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{m.ad_group_name}</div>
                  <div className="text-xs text-[var(--color-text-dim)]">
                    → {m.portal_role}
                    {m.assigned_region ? ` · ${m.assigned_region}` : ""}
                    {m.program_slugs?.length ? ` · ${m.program_slugs.join(", ")}` : ""}
                  </div>
                </div>
                <span className="text-[var(--color-accent)] text-sm">Edit →</span>
              </div>
            </Link>
          ))
        )}
      </div>

      <h2 className="text-sm font-medium mb-3">Recent Sync Activity</h2>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {(recentSyncs ?? []).length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-dim)]">
            No sync activity yet.
          </p>
        ) : (
          (recentSyncs ?? []).map((s: any, i: number) => (
            <div
              key={i}
              className="px-4 py-2 border-b border-[var(--color-border)] last:border-0 text-xs"
            >
              <span className="text-[var(--color-text-dim)]">
                {new Date(s.ran_at).toLocaleString()}
              </span>{" "}
              — {s.field_changed}: {s.old_value ?? "—"} → {s.new_value ?? "—"}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
