import Link from "next/link";
import { redirect } from "next/navigation";
import { getInsightsAccess } from "@/lib/insightsAccess";
import { REPORTS, type ReportDef } from "@/lib/reportsSuite/catalog";

export const dynamic = "force-dynamic";

const COLUMN = {
  programs: { title: "Programs", bg: "#1F6F54", fg: "#fff" },
  central: { title: "Revenue & operations", bg: "#22427A", fg: "#fff" },
  regions: { title: "Regions", bg: "#E9A92E", fg: "#2B1D00" },
} as const;
const ACCENT = { red: { bg: "#A93226", fg: "#fff" }, purple: { bg: "#7B3F98", fg: "#fff" } };
const STATUS = {
  live: null,
  partial: { label: "Partial data", color: "#9A6412", bg: "#FBF0D9" },
  waiting: { label: "Waiting on Salesforce", color: "#6B5B7B", bg: "#EFEAF4" },
};

function Tile({ r }: { r: ReportDef }) {
  const col = r.color ? ACCENT[r.color] : COLUMN[r.column];
  const s = STATUS[r.status];
  const href = r.href ?? `/admin/insights/reports/${r.key}`;
  return (
    <Link
      href={href}
      className="block rounded-xl px-4 py-3 transition-transform hover:-translate-y-0.5"
      style={{ background: col.bg, color: col.fg, boxShadow: "0 2px 0 rgba(0,0,0,0.12)" }}
      title={r.statusNote}
    >
      <div className="text-[13px] font-bold uppercase tracking-wide text-center">{r.title}</div>
      {s && (
        <div className="mt-1.5 flex justify-center">
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: s.bg, color: s.color }}>
            {s.label}
          </span>
        </div>
      )}
    </Link>
  );
}

// The portal's version of the Power BI navigation page.
export default async function ReportsHubPage() {
  const access = await getInsightsAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/admin");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#16302B" }}>Standard reports</h1>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: "rgba(22,48,43,0.62)" }}>
            Every Power BI report, rebuilt on live portal data. Each report has the same filters (year, month, region, state, field office) and exports to CSV.
            {access.lockedOffice ? " You're seeing your office's numbers." : access.lockedRegion ? ` You're seeing ${access.lockedRegion}.` : ""}
          </p>
        </div>
      </div>

      <div className="rounded-2xl px-4 py-3 text-[12px]" style={{ background: "#22427A", color: "#fff" }}>
        <span className="font-semibold">Partial data</span> = built, but part of its data source isn&apos;t in the portal yet (hover a tile to see what). <span className="font-semibold">Waiting on Salesforce</span> = fills in once donations sync.
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {(["programs", "central", "regions"] as const).map((c) => (
          <div key={c}>
            <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "rgba(22,48,43,0.5)" }}>{COLUMN[c].title}</div>
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
