import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORTS } from "@/lib/reportsSuite/catalog";
import { isMapped } from "@/lib/powerbiReports/engine";
import { createAdminClient } from "@/lib/supabase/server";
import ReadModelButton from "./ReadModelButton";

export const dynamic = "force-dynamic";

const COLUMN = {
  programs: "Programs",
  central: "Revenue & operations",
  regions: "Regions",
} as const;

// Temporary: the same reports as Standard reports, with every number drawn
// from the Power BI model, until Power BI is retired.
export default async function PowerBiReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/admin");

  const { data: last } = await createAdminClient()
    .from("pbi_model_snapshots")
    .select("captured_at")
    .is("error", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRead = last?.captured_at
    ? new Date(last.captured_at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  const reports = REPORTS.filter((r) => !r.href);
  const mapped = reports.filter((r) => isMapped(r.key)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold" style={{ color: "#16302B" }}>
              Power BI reports
            </h1>
            <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5" style={{ background: "#FBF0DC", color: "#A57420" }}>
              Temporary
            </span>
          </div>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: "rgba(22,48,43,0.62)" }}>
            The same reports and filters as Standard reports, with every number pulled from Power BI. As current as Power BI&apos;s last refresh.
          </p>
        </div>
        <Link
          href="/admin/powerbi/check"
          className="text-xs font-semibold rounded-full px-3 py-1.5"
          style={{ border: "1.5px solid rgba(22,48,43,0.12)", color: "rgba(22,48,43,0.7)" }}
        >
          Compare with portal →
        </Link>
      </div>

      <ReadModelButton lastRead={lastRead} />

      {mapped === 0 && (
        <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: "#FBF0DC", color: "#7A5617" }}>
          No reports are connected to the Power BI model yet. They appear here as each one is mapped.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {(["programs", "central", "regions"] as const).map((c) => {
          const list = reports.filter((r) => r.column === c);
          if (!list.length) return null;
          return (
            <div key={c}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "rgba(22,48,43,0.5)" }}>
                {COLUMN[c]}
              </div>
              <div className="grid gap-2.5">
                {list.map((r) =>
                  isMapped(r.key) ? (
                    <Link
                      key={r.key}
                      href={`/admin/powerbi/${r.key}`}
                      className="block rounded-xl px-4 py-3 text-center text-[13px] font-bold uppercase tracking-wide transition-transform hover:-translate-y-0.5"
                      style={{ background: "#F2C811", color: "#2B2300", boxShadow: "0 2px 0 rgba(0,0,0,0.12)" }}
                    >
                      {r.title}
                    </Link>
                  ) : (
                    <div
                      key={r.key}
                      className="rounded-xl px-4 py-3 text-center"
                      style={{ background: "rgba(22,48,43,0.04)", color: "rgba(22,48,43,0.4)", border: "1px dashed rgba(22,48,43,0.15)" }}
                    >
                      <div className="text-[13px] font-bold uppercase tracking-wide">{r.title}</div>
                      <div className="text-[10px] mt-0.5">Not mapped yet</div>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
