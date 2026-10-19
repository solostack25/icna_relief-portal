import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { REPORTS, type ReportDef } from "@/lib/reportsSuite/catalog";
import { isMapped } from "@/lib/powerbiReports/engine";
import { PBI_NO_PAGE } from "@/lib/powerbiReports/specs";
import ReadModelButton from "./ReadModelButton";

export const dynamic = "force-dynamic";

// Same layout and colors as Standard reports (app/admin/insights/reports),
// so the two read side by side; every tile here opens the Power BI version.
const COLUMN = {
  programs: { title: "Programs", bg: "#1F6F54", fg: "#fff" },
  central: { title: "Revenue & operations", bg: "#22427A", fg: "#fff" },
  regions: { title: "Regions", bg: "#E9A92E", fg: "#2B1D00" },
} as const;
const ACCENT = { red: { bg: "#A93226", fg: "#fff" }, purple: { bg: "#7B3F98", fg: "#fff" } };

function Tile({ r }: { r: ReportDef }) {
  const noPage = PBI_NO_PAGE[r.key];
  if (!isMapped(r.key)) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-center"
        style={{ background: "rgba(22,48,43,0.04)", color: "rgba(22,48,43,0.42)", border: "1px dashed rgba(22,48,43,0.15)" }}
        title={noPage}
      >
        <div className="text-[13px] font-bold uppercase tracking-wide">{r.title}</div>
        <div className="mt-1.5 flex justify-center">
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: "rgba(22,48,43,0.06)" }}>
            {noPage ? "No Power BI page" : "Not mapped yet"}
          </span>
        </div>
      </div>
    );
  }
  const col = r.color ? ACCENT[r.color] : COLUMN[r.column];
  return (
    <Link
      href={`/admin/powerbi/${encodeURIComponent(r.key)}`}
      className="block rounded-xl px-4 py-3 transition-transform hover:-translate-y-0.5"
      style={{ background: col.bg, color: col.fg, boxShadow: "0 2px 0 rgba(0,0,0,0.12)" }}
    >
      <div className="text-[13px] font-bold uppercase tracking-wide text-center">{r.title}</div>
    </Link>
  );
}

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

  return (
    <div className="space-y-4">
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
            The same reports as Standard reports, with every number pulled from Power BI. Each report has the same filters and exports to CSV, and is as current as Power BI&apos;s last refresh.
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

      <div className="rounded-2xl px-4 py-3 text-[12px]" style={{ background: "#22427A", color: "#fff" }}>
        <span className="font-semibold">No Power BI page</span> = Power BI has no data page for this one (it&apos;s a menu or text only). Hover a tile to see why.
      </div>

      <ReadModelButton lastRead={lastRead} />

      <div className="grid md:grid-cols-3 gap-6">
        {(["programs", "central", "regions"] as const).map((c) => (
          <div key={c}>
            <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "rgba(22,48,43,0.5)" }}>
              {COLUMN[c].title}
            </div>
            <div className="grid gap-2.5">
              {REPORTS.filter((r) => r.column === c).map((r) => (
                <Tile key={r.key} r={r} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
