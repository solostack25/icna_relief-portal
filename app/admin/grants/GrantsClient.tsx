"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

type Grant = {
  id: string;
  title: string;
  funder_name: string | null;
  program: string;
  office_id: string | null;
  region: string | null;
  amount: number;
  fiscal_year: number;
  received_date: string | null;
  notes: string | null;
  resolvedRegion: string;
  chapter: string | null;
  state: string | null;
  fieldOffice: string | null;
};
type Goal = { id: string; region: string; fiscal_year: number; goal_amount: number };
type Office = { id: string; field_office: string; region: string; chapter: string | null; state: string | null };

const PROGRAMS = ["Back2School", "Disaster Relief Services", "General", "Health Services", "Hunger Prevention", "Refugee Services"];
const PROGRAM_COLOR: Record<string, string> = {
  Back2School: "#E2892F",
  "Disaster Relief Services": "#B5566B",
  General: "#8A9186",
  "Health Services": "#3E7FBF",
  "Hunger Prevention": "#8A5FB5",
  "Refugee Services": "#2F6D46",
};
const REGION_COLORS = ["#2F6D46", "#3E7FBF", "#E2892F", "#8A5FB5", "#B5566B", "#3E9E8F", "#A57420", "#7A9186"];

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

export default function GrantsClient({ grants: initialGrants, goals: initialGoals, offices }: { grants: Grant[]; goals: Goal[]; offices: Office[] }) {
  const supabase = createClient();
  const [grants, setGrants] = useState(initialGrants);
  const [goals, setGoals] = useState(initialGoals);

  const years = useMemo(() => [...new Set(grants.map((g) => g.fiscal_year))].sort((a, b) => b - a), [grants]);
  const [year, setYear] = useState<number | "all">(years[0] ?? new Date().getFullYear());
  const [regionFilter, setRegionFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");

  const regions = useMemo(() => [...new Set([...offices.map((o) => o.region), ...grants.map((g) => g.resolvedRegion)])].sort(), [offices, grants]);
  const chapters = useMemo(() => [...new Set(offices.map((o) => o.chapter).filter(Boolean))].sort() as string[], [offices]);
  const states = useMemo(() => [...new Set(offices.map((o) => o.state).filter(Boolean))].sort() as string[], [offices]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    funder_name: "",
    program: PROGRAMS[0],
    office_id: "",
    region: "",
    amount: "",
    fiscal_year: new Date().getFullYear(),
    received_date: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    return grants.filter((g) => {
      if (year !== "all" && g.fiscal_year !== year) return false;
      if (regionFilter && g.resolvedRegion !== regionFilter) return false;
      if (chapterFilter && g.chapter !== chapterFilter) return false;
      if (stateFilter && g.state !== stateFilter) return false;
      if (officeFilter && g.office_id !== officeFilter) return false;
      return true;
    });
  }, [grants, year, regionFilter, chapterFilter, stateFilter, officeFilter]);

  const matrix = useMemo(() => {
    const byRegion = new Map<string, Record<string, number>>();
    for (const g of filtered) {
      const row = byRegion.get(g.resolvedRegion) ?? {};
      row[g.program] = (row[g.program] ?? 0) + Number(g.amount);
      byRegion.set(g.resolvedRegion, row);
    }
    const rows = Array.from(byRegion.entries())
      .map(([region, cells]) => ({ region, cells, total: Object.values(cells).reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total);
    const programTotals: Record<string, number> = {};
    PROGRAMS.forEach((p) => (programTotals[p] = rows.reduce((s, r) => s + (r.cells[p] ?? 0), 0)));
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return { rows, programTotals, grandTotal };
  }, [filtered]);

  const goalForYear = useMemo(() => {
    if (year === "all") return new Map<string, number>();
    return new Map(goals.filter((g) => g.fiscal_year === year).map((g) => [g.region, g.goal_amount]));
  }, [goals, year]);
  const totalGoal = useMemo(() => Array.from(goalForYear.values()).reduce((s, v) => s + v, 0), [goalForYear]);

  const byYearChart = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of grants) map.set(g.fiscal_year, (map.get(g.fiscal_year) ?? 0) + Number(g.amount));
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([y, amt]) => ({ year: String(y), amount: amt }));
  }, [grants]);

  const byRegionChart = matrix.rows.map((r) => ({ name: r.region, value: r.total }));
  const byProgramChart = PROGRAMS.map((p) => ({ name: p, value: matrix.programTotals[p] })).filter((d) => d.value > 0);

  async function handleAddGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.amount || (!form.office_id && !form.region)) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single() : { data: null };

    const { data: inserted, error } = await supabase
      .from("grants")
      .insert({
        title: form.title,
        funder_name: form.funder_name || null,
        program: form.program,
        office_id: form.office_id || null,
        region: form.office_id ? null : form.region,
        amount: Number(form.amount),
        fiscal_year: form.fiscal_year,
        received_date: form.received_date || null,
        notes: form.notes || null,
        created_by: employee?.id ?? null,
      })
      .select("id, title, funder_name, program, office_id, region, amount, fiscal_year, received_date, notes")
      .single();

    setSaving(false);
    if (error || !inserted) return;

    const office = form.office_id ? offices.find((o) => o.id === form.office_id) : null;
    setGrants((prev) => [
      ...prev,
      {
        ...inserted,
        resolvedRegion: office?.region ?? form.region ?? "Unassigned",
        chapter: office?.chapter ?? null,
        state: office?.state ?? null,
        fieldOffice: office?.field_office ?? null,
      },
    ]);
    setShowAddForm(false);
    setForm({ title: "", funder_name: "", program: PROGRAMS[0], office_id: "", region: "", amount: "", fiscal_year: new Date().getFullYear(), received_date: "", notes: "" });
  }

  async function saveGoal(region: string, amount: number) {
    if (year === "all") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single() : { data: null };

    const { data: upserted } = await supabase
      .from("grant_region_goals")
      .upsert({ region, fiscal_year: year, goal_amount: amount, updated_by: employee?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "region,fiscal_year" })
      .select("id, region, fiscal_year, goal_amount")
      .single();

    if (upserted) {
      setGoals((prev) => {
        const existing = prev.find((g) => g.region === region && g.fiscal_year === year);
        if (existing) return prev.map((g) => (g.id === existing.id ? upserted : g));
        return [...prev, upserted];
      });
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2.5 mb-6">
        <select value={year} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))} style={inputStyle}>
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={inputStyle}>
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)} style={inputStyle}>
          <option value="">All chapters</option>
          {chapters.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={inputStyle}>
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} style={inputStyle}>
          <option value="">All filed offices</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.field_office}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setShowGoals((s) => !s)}
          className="text-sm font-bold rounded-full px-4 py-2.5 cursor-pointer"
          style={{ background: "#F4F3EE", color: "rgba(22,48,43,0.6)" }}
        >
          {showGoals ? "Hide Goals" : "Edit Goals"}
        </button>
        <button
          onClick={() => setShowAddForm((s) => !s)}
          className="text-sm font-bold rounded-full px-5 py-2.5 text-white cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald, #2F6D46)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          + Add Grant
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddGrant} style={{ ...cardStyle, padding: "22px 24px", marginBottom: 24 }} className="grid grid-cols-2 gap-3">
          <input required placeholder="Grant title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} className="col-span-2" />
          <input placeholder="Funder / foundation name" value={form.funder_name} onChange={(e) => setForm((f) => ({ ...f, funder_name: e.target.value }))} style={inputStyle} />
          <select value={form.program} onChange={(e) => setForm((f) => ({ ...f, program: e.target.value }))} style={inputStyle}>
            {PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={form.office_id} onChange={(e) => setForm((f) => ({ ...f, office_id: e.target.value, region: "" }))} style={inputStyle}>
            <option value="">No specific office…</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.field_office}
              </option>
            ))}
          </select>
          {!form.office_id && (
            <select value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} style={inputStyle}>
              <option value="">Region (required if no office)…</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          <input required type="number" min={0} placeholder="Amount ($)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={inputStyle} />
          <input
            required
            type="number"
            placeholder="Fiscal year"
            value={form.fiscal_year}
            onChange={(e) => setForm((f) => ({ ...f, fiscal_year: Number(e.target.value) }))}
            style={inputStyle}
          />
          <input type="date" value={form.received_date} onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))} style={inputStyle} />
          <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={inputStyle} className="col-span-2" />
          <button
            type="submit"
            disabled={saving}
            className="col-span-2 rounded-full text-white text-sm font-bold px-5 py-2.5 disabled:opacity-50 cursor-pointer"
            style={{ background: "var(--portal-emerald, #2F6D46)" }}
          >
            {saving ? "Saving…" : "Add Grant"}
          </button>
        </form>
      )}

      {/* Matrix table */}
      <div style={{ ...cardStyle, overflow: "hidden", marginBottom: 24 }}>
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ width: "100%", minWidth: 760 }}>
            <thead style={{ background: "#16302B" }}>
              <tr>
                <th className="px-4 py-3 text-left font-bold text-white">Region</th>
                {PROGRAMS.map((p) => (
                  <th key={p} className="px-3 py-3 text-right font-semibold text-white text-xs">
                    {p}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-bold text-white">Total</th>
                {showGoals ? (
                  <th className="px-4 py-3 text-right font-bold text-white">Goal</th>
                ) : (
                  <th className="px-4 py-3 text-right font-bold text-white">Goal</th>
                )}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r, i) => (
                <tr key={r.region} style={{ borderTop: i === 0 ? "none" : "1px solid var(--portal-line, rgba(22,48,43,0.06))" }}>
                  <td className="px-4 py-2.5 font-bold">{r.region}</td>
                  {PROGRAMS.map((p) => (
                    <td key={p} className="px-3 py-2.5 text-right" style={{ color: r.cells[p] ? "#16302B" : "rgba(22,48,43,0.25)" }}>
                      {r.cells[p] ? money(r.cells[p]) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold">{money(r.total)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {showGoals && year !== "all" ? (
                      <input
                        type="number"
                        defaultValue={goalForYear.get(r.region) ?? 0}
                        onBlur={(e) => saveGoal(r.region, Number(e.target.value))}
                        style={{ ...inputStyle, width: 100, padding: "4px 8px", textAlign: "right" }}
                      />
                    ) : (
                      <span style={{ color: "rgba(22,48,43,0.5)" }}>{money(goalForYear.get(r.region) ?? 0)}</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--portal-line, rgba(22,48,43,0.12))", background: "#F4F3EE" }}>
                <td className="px-4 py-3 font-bold">Total</td>
                {PROGRAMS.map((p) => (
                  <td key={p} className="px-3 py-3 text-right font-bold">
                    {matrix.programTotals[p] ? money(matrix.programTotals[p]) : "—"}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-bold">{money(matrix.grandTotal)}</td>
                <td className="px-4 py-3 text-right font-bold">{money(totalGoal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <h3 className="text-xs font-bold mb-2" style={{ color: "rgba(22,48,43,0.5)" }}>
            GRANTS RECEIVED BY YEAR
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byYearChart}>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v / 1000000}M`} />
              <Tooltip formatter={(v) => money(Number(v))} />
              <Bar dataKey="amount" fill="#2F6D46" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <h3 className="text-xs font-bold mb-2" style={{ color: "rgba(22,48,43,0.5)" }}>
            GRANTS BY REGION
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byRegionChart} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                {byRegionChart.map((_, i) => (
                  <Cell key={i} fill={REGION_COLORS[i % REGION_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <h3 className="text-xs font-bold mb-2" style={{ color: "rgba(22,48,43,0.5)" }}>
            GRANTS BY PROGRAM
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byProgramChart} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                {byProgramChart.map((d, i) => (
                  <Cell key={i} fill={PROGRAM_COLOR[d.name] ?? REGION_COLORS[i % REGION_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
