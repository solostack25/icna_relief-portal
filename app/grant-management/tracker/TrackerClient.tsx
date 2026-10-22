"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GRANT_STATUS_LABELS, fmtDate, money, pct, isOverBudget, isUnderspent, type GrantSummary } from "@/lib/grantManagement/shared";
import { Card, Empty, ExportButtons, GrantStatusPill, PageTitle, PillButton, SpendBar, dim, faint, gold, ink, inputStyle, rose, selectStyle, td, tdNum, th, thNum } from "@/components/grantManagement/ui";

type Filters = { status: string; office_id: string; region: string; program: string; funder: string };
type SortKey = "code" | "name" | "funder" | "office" | "award_amount" | "total_budget" | "actual" | "remaining" | "pct_spent" | "end_date";

export default function TrackerClient({ grants, canCreate, initial }: { grants: GrantSummary[]; canCreate: boolean; initial: Filters }) {
  const [f, setF] = useState<Filters>(initial.status || initial.office_id || initial.region || initial.program || initial.funder ? initial : { ...initial, status: "active" });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "end_date", dir: 1 });

  const opts = useMemo(() => {
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
    const offices = [...new Map(grants.filter((g) => g.office_id).map((g) => [g.office_id!, g.office_name ?? g.office_id!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return { offices, regions: uniq(grants.map((g) => g.resolved_region)), programs: uniq(grants.map((g) => g.program)), funders: uniq(grants.map((g) => g.funder)) };
  }, [grants]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = grants.filter(
      (g) =>
        (!f.status || g.status === f.status) &&
        (!f.office_id || g.office_id === f.office_id) &&
        (!f.region || g.resolved_region === f.region) &&
        (!f.program || g.program === f.program) &&
        (!f.funder || g.funder === f.funder) &&
        (!needle || `${g.code} ${g.name} ${g.funder} ${g.office_name ?? ""}`.toLowerCase().includes(needle))
    );
    const val = (g: GrantSummary): string | number => (sort.key === "office" ? g.office_name ?? "" : (g[sort.key] as string | number) ?? "");
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [grants, f, q, sort]);

  const totals = rows.reduce(
    (t, g) => ({ award: t.award + g.award_amount, budget: t.budget + g.total_budget, actual: t.actual + g.actual, pending: t.pending + g.pending, remaining: t.remaining + g.remaining }),
    { award: 0, budget: 0, actual: 0, pending: 0, remaining: 0 }
  );
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const setSortKey = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }));
  const Sort = ({ k, label, num }: { k: SortKey; label: string; num?: boolean }) => (
    <th style={num ? thNum : th}>
      <button type="button" onClick={() => setSortKey(k)} className="uppercase" style={{ font: "inherit", color: "inherit", letterSpacing: "inherit" }}>
        {label}
        {sort.key === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div>
      <PageTitle
        eyebrow="All grant budgets in one place"
        title={canCreate ? "Master Grant Budget Tracker" : "Grants"}
        right={
          <div className="flex flex-wrap gap-2 print:hidden">
            <ExportButtons query={`report=master&${qs}`} />
            {canCreate && <PillButton href="/grant-management/grants/new">+ New grant</PillButton>}
          </div>
        }
      />

      <Card className="!p-4 mb-4 print:hidden">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input placeholder="Search code, name, funder…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, padding: "9px 12px" }} className="col-span-2 md:col-span-1" />
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={selectStyle}>
            <option value="">All statuses</option>
            {Object.entries(GRANT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={f.office_id} onChange={(e) => setF({ ...f, office_id: e.target.value })} style={selectStyle}>
            <option value="">All offices</option>
            {opts.offices.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} style={selectStyle}>
            <option value="">All regions</option>
            {opts.regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={f.program} onChange={(e) => setF({ ...f, program: e.target.value })} style={selectStyle}>
            <option value="">All programs</option>
            {opts.programs.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={f.funder} onChange={(e) => setF({ ...f, funder: e.target.value })} style={selectStyle}>
            <option value="">All funders</option>
            {opts.funders.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Empty>{grants.length ? "No grants match these filters." : canCreate ? "No grants yet. Create the first one with + New grant." : "No grants are assigned to your office yet."}</Empty>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto" style={{ maxHeight: "70vh" }}>
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <Sort k="code" label="Grant" />
                  <Sort k="funder" label="Funder" />
                  <Sort k="office" label="Office / region" />
                  <Sort k="award_amount" label="Award" num />
                  <Sort k="total_budget" label="Budget" num />
                  <Sort k="actual" label="Spent" num />
                  <Sort k="remaining" label="Remaining" num />
                  <Sort k="pct_spent" label="% spent" num />
                  <Sort k="end_date" label="Ends" />
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const over = isOverBudget(g);
                  const under = isUnderspent(g);
                  return (
                    <tr key={g.id} className="hover:bg-[#FDFBF6]">
                      <td style={td}>
                        <Link href={`/grant-management/grants/${g.id}`} className="block">
                          <div className="text-[11px] font-bold" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
                            {g.code}
                          </div>
                          <div className="font-semibold hover:underline" style={{ color: ink }}>
                            {g.name}
                          </div>
                          <div className="text-xs" style={{ color: dim }}>
                            {g.program}
                          </div>
                        </Link>
                      </td>
                      <td style={td}>{g.funder}</td>
                      <td style={td}>
                        <div>{g.office_name ?? "—"}</div>
                        <div className="text-xs" style={{ color: dim }}>
                          {[g.resolved_region, g.resolved_state].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td style={tdNum}>{money(g.award_amount)}</td>
                      <td style={tdNum}>{money(g.total_budget)}</td>
                      <td style={tdNum}>
                        {money(g.actual)}
                        {g.pending > 0 && (
                          <div className="text-[11px]" style={{ color: gold }}>
                            +{money(g.pending)} pending
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdNum, color: g.remaining < 0 ? rose : ink }}>{money(g.remaining)}</td>
                      <td style={{ ...tdNum, minWidth: 120 }}>
                        <div style={{ color: over ? rose : ink }}>{pct(g.pct_spent)}</div>
                        <div className="mt-1">
                          <SpendBar pct={g.pct_spent} timePct={g.status === "active" ? g.pct_time_elapsed : null} height={5} />
                        </div>
                        {under && (
                          <div className="text-[11px] mt-0.5" style={{ color: "#3E7C9A" }}>
                            behind pace
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {fmtDate(g.end_date)}
                        {g.status === "active" && g.days_left >= 0 && g.days_left <= 90 && (
                          <div className="text-[11px]" style={{ color: g.days_left <= 30 ? rose : gold }}>
                            {g.days_left} days left
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <GrantStatusPill status={g.status} />
                        {g.missing_docs > 0 && (
                          <div className="text-[11px] mt-1" style={{ color: gold }}>
                            {g.missing_docs} missing doc{g.missing_docs === 1 ? "" : "s"}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FDFBF6" }}>
                  <td style={{ ...td, fontWeight: 700 }} colSpan={3}>
                    {rows.length} grant{rows.length === 1 ? "" : "s"}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(totals.award)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(totals.budget)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(totals.actual)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(totals.remaining)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{pct(totals.budget > 0 ? (totals.actual / totals.budget) * 100 : null)}</td>
                  <td style={td} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs mt-3" style={{ color: faint }}>
        Spent = approved expenses. The dark tick on each bar marks how much of the grant period has passed.
      </p>
    </div>
  );
}
