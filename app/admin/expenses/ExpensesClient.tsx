"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, Btn, C, Card, inputStyle, MONTH_SHORT, money, Notice, num, SOURCE_LABEL, td, th } from "./ui";
import EntryForm, { type RowData } from "./EntryForm";
import ImportPanel from "./ImportPanel";
import MappingPanel from "./MappingPanel";
import WeightsPanel from "./WeightsPanel";
import QuickBooksPanel from "./QuickBooksPanel";

type MonthSum = { month: number; office: number; central: number; grant: number; revenue: number; grantRevenue: number; centralShared: number; rows: number; sources: string[] };
export type Office = { id: string; name: string; region: string | null; state: string | null };
type Data = { year: number; month: number | null; months: MonthSum[]; rows: RowData[] | null; offices: Office[]; years: number[] };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "enter", label: "Enter" },
  { key: "import", label: "Upload" },
  { key: "quickbooks", label: "QuickBooks" },
  { key: "mapping", label: "Class mapping" },
  { key: "fte", label: "FTE shares" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function ExpensesClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RowData | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem("expenses_tab") as Tab | null;
      if (t && TABS.some((x) => x.key === t)) setTab(t);
    } catch {}
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    try {
      sessionStorage.setItem("expenses_tab", t);
    } catch {}
  };

  const load = useCallback(async (y: number, m: number | null) => {
    setError(null);
    try {
      let d = await api<Data>(`/api/admin/expenses?year=${y}${m ? `&month=${m}` : ""}`);
      if (!m) {
        // Open on the latest month that has data.
        const latest = [...d.months].reverse().find((x) => x.rows > 0)?.month ?? new Date().getMonth() + 1;
        setMonth(latest);
        d = await api<Data>(`/api/admin/expenses?year=${y}&month=${latest}`);
      }
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const refresh = () => load(year, month);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setMonth(null); }} style={inputStyle} aria-label="Year">
          {(data?.years ?? [year]).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {MONTH_SHORT.map((m, i) => {
            const has = (data?.months[i]?.rows ?? 0) > 0;
            const active = month === i + 1;
            return (
              <button
                key={m}
                onClick={() => setMonth(i + 1)}
                className="rounded-full text-xs font-semibold"
                style={{
                  padding: "5px 10px",
                  background: active ? C.emerald : has ? "#EAF3EF" : "transparent",
                  color: active ? "#fff" : has ? C.emerald : C.faint,
                  border: `1px solid ${active ? C.emerald : has ? "rgba(31,111,84,0.25)" : C.line}`,
                }}
                title={has ? "Has data" : "No data yet"}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 mb-6" style={{ borderBottom: `1px solid ${C.line}` }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: -1,
              borderBottom: tab === t.key ? `2px solid ${C.emerald}` : "2px solid transparent",
              color: tab === t.key ? C.emerald : C.soft,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <Notice ok={false}>{error}</Notice>}

      {tab === "overview" && (
        <Overview
          data={data}
          year={year}
          month={month}
          onEdit={(r) => {
            setEditing(r);
            go("enter");
          }}
          onNew={() => {
            setEditing(null);
            go("enter");
          }}
        />
      )}
      {tab === "enter" && month && data && (
        <EntryForm
          key={`${editing?.id ?? "new"}-${year}-${month}`}
          year={year}
          month={month}
          offices={data.offices}
          rows={data.rows ?? []}
          initial={editing}
          onSaved={() => {
            refresh();
          }}
          onDone={() => {
            setEditing(null);
            go("overview");
          }}
        />
      )}
      {tab === "import" && (
        <ImportPanel
          year={year}
          month={month}
          onApplied={(y, m) => {
            if (y && m && (y !== year || m !== month)) {
              setYear(y);
              setMonth(m);
            } else refresh();
          }}
        />
      )}
      {tab === "quickbooks" && <QuickBooksPanel year={year} month={month} onPulled={refresh} />}
      {tab === "mapping" && <MappingPanel />}
      {tab === "fte" && <WeightsPanel year={year} offices={data?.offices ?? []} onSaved={refresh} />}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-xs font-semibold mb-1" style={{ color: C.soft }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: tone === "bad" ? C.bad : tone === "good" ? C.good : C.ink, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: C.faint }}>{sub}</div>}
    </div>
  );
}

function Overview({ data, year, month, onEdit, onNew }: { data: Data | null; year: number; month: number | null; onEdit: (r: RowData) => void; onNew: () => void }) {
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const offices = rows.filter((r) => r.scope === "office");
  const central = rows.filter((r) => r.scope === "central");
  const grants = rows.filter((r) => r.scope === "grant");
  const sum = (list: RowData[], f: (r: RowData) => number | null | undefined) => list.reduce((s, r) => s + Number(f(r) ?? 0), 0);

  const direct = sum(offices, (r) => r.expenses_total);
  const shared = sum(offices, (r) => r.central_share);
  const centralTotal = sum(central, (r) => r.expenses_total);
  const revenue = sum(offices, (r) => r.revenue);
  const grantTotal = sum(grants, (r) => r.expenses_total);
  const grantRevenue = sum(grants, (r) => r.revenue);
  const unshared = Math.round((centralTotal - shared) * 100) / 100;

  const regions = [...new Set(offices.map((r) => r.region ?? "—"))].sort();
  const shown = offices
    .filter((r) => !region || (r.region ?? "—") === region)
    .filter((r) => !q || (r.office_name ?? "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.region ?? "").localeCompare(b.region ?? "") || (a.office_name ?? "").localeCompare(b.office_name ?? ""));

  const byDept = new Map<string, { total: number; rows: RowData[] }>();
  for (const r of central) {
    const d = byDept.get(r.department ?? "—") ?? byDept.set(r.department ?? "—", { total: 0, rows: [] }).get(r.department ?? "—")!;
    d.total += Number(r.expenses_total || 0);
    d.rows.push(r);
  }

  const sources = [...new Set(rows.map((r) => r.source))];
  const ym = month ? `&year=${year}&month=${month}` : `&year=${year}`;
  const label = month ? `${MONTH_SHORT[month - 1]} ${year}` : String(year);

  if (!data) return <p className="text-sm" style={{ color: C.soft }}>Loading…</p>;

  return (
    <div>
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Tile label="Office expenses (direct)" value={money(direct)} sub={`${offices.length} offices`} />
        <Tile label="Central departments" value={money(centralTotal)} sub={unshared && Math.abs(unshared) > 1 ? `${money(unshared)} not shared to offices` : "Fully shared to offices"} />
        <Tile label="Total expenditure" value={money(direct + shared)} sub="Direct + central share" />
        <Tile label="Revenue" value={money(revenue)} sub={revenue ? `Net ${money(revenue - direct - shared)}` : "Not entered yet"} tone={revenue ? (revenue - direct - shared >= 0 ? "good" : "bad") : undefined} />
        <Tile label="Grant expenses" value={money(grantTotal)} sub={grantRevenue ? `Grant revenue ${money(grantRevenue)}` : `${grants.length} grant offices`} />
      </div>

      {!rows.length ? (
        <Card>
          <p className="text-sm mb-4" style={{ color: C.soft }}>Nothing for {label} yet. Pull it from QuickBooks, upload a file, or type it in.</p>
          <Btn onClick={onNew}>Enter expenses</Btn>
        </Card>
      ) : (
        <>
          <Card
            title={`Offices · ${label}`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <input placeholder="Search office" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, width: 160 }} />
                <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
                  <option value="">All regions</option>
                  {regions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <Btn kind="ghost" small href={`/api/admin/expenses/export?scope=office${ym}`}>Export CSV</Btn>
                <Btn small onClick={onNew}>Add row</Btn>
              </div>
            }
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={th}>Office</th>
                    <th style={th}>Region</th>
                    <th style={{ ...th, textAlign: "right" }}>Revenue</th>
                    <th style={{ ...th, textAlign: "right" }}>Direct</th>
                    <th style={{ ...th, textAlign: "right" }}>Central share</th>
                    <th style={{ ...th, textAlign: "right" }}>Total</th>
                    <th style={{ ...th, textAlign: "right" }}>Revenue − total</th>
                    <th style={th}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const total = Number(r.expenses_total || 0) + Number(r.central_share || 0);
                    const net = r.revenue != null ? Number(r.revenue) - total : null;
                    return (
                      <tr key={r.id} onClick={() => onEdit(r)} style={{ cursor: "pointer" }}>
                        <td style={td}>
                          {r.office_name}
                          {!r.office_id && <span className="text-xs ml-2" style={{ color: C.warn }}>not a portal office</span>}
                        </td>
                        <td style={{ ...td, color: C.soft }}>{r.region ?? "—"}</td>
                        <td style={num}>{money(r.revenue)}</td>
                        <td style={num}>{money(r.expenses_total)}</td>
                        <td style={num}>{money(r.central_share)}</td>
                        <td style={{ ...num, fontWeight: 600 }}>{money(total)}</td>
                        <td style={{ ...num, color: net == null ? C.faint : net >= 0 ? C.good : C.bad }}>{money(net)}</td>
                        <td style={{ ...td, color: C.faint, fontSize: 12 }}>{SOURCE_LABEL[r.source] ?? r.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total ({shown.length})</td>
                    <td style={{ ...num, fontWeight: 700 }}>{money(sum(shown, (r) => r.revenue))}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{money(sum(shown, (r) => r.expenses_total))}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{money(sum(shown, (r) => r.central_share))}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{money(sum(shown, (r) => Number(r.expenses_total || 0) + Number(r.central_share || 0)))}</td>
                    <td style={num} />
                    <td style={td} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
            <Card title="Central departments" right={<Btn kind="ghost" small href={`/api/admin/expenses/export?scope=central${ym}`}>Export CSV</Btn>}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[...byDept].map(([dept, d]) => (
                    <DeptRows key={dept} dept={dept} total={d.total} rows={d.rows} onEdit={onEdit} />
                  ))}
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }}>Total</td>
                    <td style={{ ...num, fontWeight: 700 }}>{money(centralTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
            <Card title="Grants" right={<Btn kind="ghost" small href={`/api/admin/expenses/export?scope=grant${ym}`}>Export CSV</Btn>}>
              {grants.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Office</th>
                      <th style={{ ...th, textAlign: "right" }}>Grant revenue</th>
                      <th style={{ ...th, textAlign: "right" }}>Expenses</th>
                      <th style={{ ...th, textAlign: "right" }}>Surplus / deficit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...grants].sort((a, b) => Number(b.expenses_total) - Number(a.expenses_total)).map((r) => {
                      const s = r.revenue != null ? Number(r.revenue) - Number(r.expenses_total) : null;
                      return (
                        <tr key={r.id} onClick={() => onEdit(r)} style={{ cursor: "pointer" }}>
                          <td style={td}>{r.office_name}</td>
                          <td style={num}>{money(r.revenue)}</td>
                          <td style={num}>{money(r.expenses_total)}</td>
                          <td style={{ ...num, color: s == null ? C.faint : s >= 0 ? C.good : C.bad }}>{money(s)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm" style={{ color: C.soft }}>No grant rows this month.</p>
              )}
            </Card>
          </div>

          <p className="text-xs" style={{ color: C.faint }}>
            Sources this month: {sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}. Whole year:{" "}
            <a className="underline" href={`/api/admin/expenses/export?scope=office&year=${year}`}>offices</a> ·{" "}
            <a className="underline" href={`/api/admin/expenses/export?scope=central&year=${year}`}>central</a> ·{" "}
            <a className="underline" href={`/api/admin/expenses/export?scope=grant&year=${year}`}>grants</a>
          </p>
        </>
      )}
    </div>
  );
}

function DeptRows({ dept, total, rows, onEdit }: { dept: string; total: number; rows: RowData[]; onEdit: (r: RowData) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        <td style={{ ...td, fontWeight: 600 }}>
          <span style={{ color: C.faint, display: "inline-block", width: 14 }}>{open ? "▾" : "▸"}</span>
          {dept}
        </td>
        <td style={{ ...num, fontWeight: 600 }}>{money(total)}</td>
      </tr>
      {open &&
        rows.map((r) => (
          <tr key={r.id} onClick={() => onEdit(r)} style={{ cursor: "pointer" }}>
            <td style={{ ...td, paddingLeft: 30, color: C.soft }}>{r.subhead}</td>
            <td style={{ ...num, color: C.soft }}>{money(r.expenses_total)}</td>
          </tr>
        ))}
    </>
  );
}
