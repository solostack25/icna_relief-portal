"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EXPENSE_STATUS_LABELS, GRANT_STATUS_LABELS, fmtDate, money, pct } from "@/lib/grantManagement/shared";
import { Card, Empty, Eyebrow, ExportButtons, PageTitle, dim, emerald, faint, ink, inputStyle, selectStyle, td, tdNum, th, thNum } from "@/components/grantManagement/ui";

type Col = { key: string; label: string; type?: "text" | "money" | "pct" | "date" | "int" };
type Report = { key: string; title: string; description: string; columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, number> };
type Options = { grants: { id: string; label: string }[]; offices: [string, string][]; regions: string[]; programs: string[]; funders: string[]; categories: string[] };

// Which filters make sense for which report.
const FILTERS: Record<string, string[]> = {
  master: ["office_id", "region", "program", "funder", "status"],
  bva: ["grant_id", "office_id", "region", "program", "funder", "status", "category"],
  expenses: ["grant_id", "office_id", "region", "program", "funder", "category", "expense_status", "date_from", "date_to"],
  by_category: ["office_id", "region", "program", "funder", "status"],
  by_office: ["region", "program", "funder", "status"],
  by_region: ["program", "funder", "status"],
  by_funder: ["office_id", "region", "program", "status"],
  by_program: ["office_id", "region", "funder", "status"],
  expiring: ["office_id", "region", "program", "funder", "days"],
  underspent: ["office_id", "region", "program", "funder"],
  budget_risk: ["office_id", "region", "program", "funder"],
  missing_docs: ["grant_id", "office_id", "region", "program", "funder", "date_from", "date_to"],
};

export default function ReportsClient({ reports, initial, options }: { reports: { key: string; title: string; description: string }[]; initial: Record<string, string>; options: Options }) {
  const [key, setKey] = useState(initial.report && FILTERS[initial.report] ? initial.report : "master");
  const [f, setF] = useState<Record<string, string>>(() => {
    const { report: _r, ...rest } = initial;
    return rest;
  });
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ report: key });
    for (const k of FILTERS[key]) {
      const v = f[k];
      if (!v) continue;
      p.set(k === "expense_status" ? "status" : k, v);
    }
    return p.toString();
  }, [key, f]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetch(`/api/grant-management/reports?${query}&format=json`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) setErr(j.error);
        else setData(j);
      })
      .catch(() => live && setErr("Couldn't load the report."))
      .finally(() => live && setLoading(false));
    window.history.replaceState(null, "", `/grant-management/reports?${query}`);
    return () => {
      live = false;
    };
  }, [query]);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const show = (k: string) => FILTERS[key].includes(k);
  const meta = reports.find((r) => r.key === key)!;

  return (
    <div>
      <PageTitle eyebrow="Grant and portfolio reports" title="Reports" right={<ExportButtons query={query} />} />
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 print:hidden">
          <Card className="!p-2">
            {reports.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setKey(r.key)}
                className="block w-full text-left rounded-xl px-3 py-2 text-sm"
                style={key === r.key ? { background: emerald, color: "#fff", fontWeight: 700 } : { color: ink }}
              >
                {r.title}
              </button>
            ))}
          </Card>
        </div>
        <div className="lg:col-span-3 min-w-0">
          <Card className="!p-4 mb-4 print:hidden">
            <Eyebrow>{meta.title}</Eyebrow>
            <p className="text-xs mb-3" style={{ color: dim }}>
              {meta.description}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {show("grant_id") && (
                <select value={f.grant_id ?? ""} onChange={(e) => set("grant_id", e.target.value)} style={selectStyle} className="col-span-2">
                  <option value="">All grants</option>
                  {options.grants.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              )}
              {show("office_id") && (
                <select value={f.office_id ?? ""} onChange={(e) => set("office_id", e.target.value)} style={selectStyle}>
                  <option value="">All offices</option>
                  {options.offices.map(([id, n]) => (
                    <option key={id} value={id}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
              {show("region") && <Sel value={f.region} onChange={(v) => set("region", v)} all="All regions" list={options.regions} />}
              {show("program") && <Sel value={f.program} onChange={(v) => set("program", v)} all="All programs" list={options.programs} />}
              {show("funder") && <Sel value={f.funder} onChange={(v) => set("funder", v)} all="All funders" list={options.funders} />}
              {show("category") && <Sel value={f.category} onChange={(v) => set("category", v)} all="All categories" list={options.categories} />}
              {show("status") && (
                <select value={f.status ?? ""} onChange={(e) => set("status", e.target.value)} style={selectStyle}>
                  <option value="">All grant statuses</option>
                  {Object.entries(GRANT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              {show("expense_status") && (
                <select value={f.expense_status ?? ""} onChange={(e) => set("expense_status", e.target.value)} style={selectStyle}>
                  <option value="">Submitted + approved</option>
                  {Object.entries(EXPENSE_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v} only
                    </option>
                  ))}
                </select>
              )}
              {show("date_from") && <input type="date" value={f.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} style={inputStyle} title="From" />}
              {show("date_to") && <input type="date" value={f.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} style={inputStyle} title="To" />}
              {show("days") && (
                <select value={f.days ?? "90"} onChange={(e) => set("days", e.target.value)} style={selectStyle}>
                  <option value="30">Ending within 30 days</option>
                  <option value="60">Ending within 60 days</option>
                  <option value="90">Ending within 90 days</option>
                  <option value="180">Ending within 180 days</option>
                </select>
              )}
            </div>
          </Card>

          <div className="hidden print:block mb-3">
            <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, margin: 0 }}>{meta.title}</h2>
            <div className="text-xs">Generated {new Date().toLocaleString()}</div>
          </div>

          {err && <Empty>{err}</Empty>}
          {!err && data && data.key === key && (
            <ReportTable report={data} loading={loading} />
          )}
          {!err && (!data || data.key !== key) && <Empty>Loading…</Empty>}
        </div>
      </div>
    </div>
  );
}

function Sel({ value, onChange, all, list }: { value?: string; onChange: (v: string) => void; all: string; list: string[] }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
      <option value="">{all}</option>
      {list.map((x) => (
        <option key={x}>{x}</option>
      ))}
    </select>
  );
}

function fmt(v: unknown, type?: Col["type"], cents = false) {
  if (v == null || v === "") return "";
  if (type === "money") return money(Number(v), cents);
  if (type === "pct") return pct(Number(v));
  if (type === "date") return fmtDate(String(v));
  if (type === "int") return Number(v).toLocaleString();
  return String(v);
}

function ReportTable({ report, loading }: { report: Report; loading: boolean }) {
  if (!report.rows.length) return <Empty>Nothing to show for these filters.</Empty>;
  const num = (c: Col) => c.type === "money" || c.type === "pct" || c.type === "int";
  const cents = report.key === "expenses" || report.key === "missing_docs";
  const WIDE: Record<string, number> = { name: 240, description: 260, funder: 180, category: 160 };
  const cell = (c: Col) => (num(c) ? tdNum : { ...td, whiteSpace: WIDE[c.key] ? ("normal" as const) : ("nowrap" as const), minWidth: WIDE[c.key] });
  return (
    <Card className="!p-0 overflow-hidden" style={{ opacity: loading ? 0.6 : 1 }}>
      <div className="overflow-auto" style={{ maxHeight: "72vh" }}>
        <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {report.columns.map((c) => (
                <th key={c.key} style={num(c) ? thNum : th}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={String(r.id ?? i)} className="hover:bg-[#FDFBF6]">
                {report.columns.map((c, ci) => {
                  const val = fmt(r[c.key], c.type, cents);
                  const isExpense = report.key === "expenses" || report.key === "missing_docs";
                  const target = isExpense ? (r.id ? `/grant-management/expenses/${r.id}` : null) : r.id ? `/grant-management/grants/${r.id}` : r.grant_id ? `/grant-management/grants/${r.grant_id}` : null;
                  const link = ci === 0 || c.key === "name" ? target : null;
                  const neg = c.type === "money" && Number(r[c.key]) < 0;
                  return (
                    <td key={c.key} style={{ ...cell(c), color: neg ? "#B5566B" : ink }}>
                      {link ? (
                        <Link href={link} className="hover:underline font-semibold">
                          {val}
                        </Link>
                      ) : (
                        val
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {report.totals && (
            <tfoot>
              <tr style={{ background: "#F3EFE4" }}>
                {report.columns.map((c, i) => (
                  <td key={c.key} style={{ ...(num(c) ? tdNum : { ...td, whiteSpace: "nowrap" as const }), fontWeight: 800 }}>
                    {i === 0 ? `Total · ${report.rows.length}` : c.key in report.totals! ? fmt(report.totals![c.key], c.type, cents) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="px-4 py-2 text-xs print:hidden" style={{ color: faint }}>
        {report.rows.length.toLocaleString()} rows
      </div>
    </Card>
  );
}
