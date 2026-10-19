"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Unit = "money" | "count" | "hours" | "lbs" | "pct";
type Status = "match" | "close" | "off" | "error" | "not-run";
type Result = {
  metricId: string;
  label: string;
  unit: Unit | null;
  portal: number | null;
  pbi: number | null;
  portalError: string | null;
  pbiError: string | null;
  diff: number | null;
  diffPct: number | null;
  status: Status;
  runAt: string | null;
};
type Metric = {
  id: string;
  label: string;
  report_key: string;
  kpi_label: string;
  dataset_id: string;
  dataset_name: string | null;
  dax: string;
  tolerance_pct: number;
  is_active: boolean;
  sort: number;
  notes: string | null;
};
type HistoryPoint = { run_at: string; portal: number | null; pbi: number | null };
type Dataset = { id: string; name: string };
type Conn = { connected: boolean; reason?: string; error?: string; datasets: Dataset[] } | null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const card: React.CSSProperties = { background: "#fff", borderRadius: 20, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const input: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};
const btn = (primary = false): React.CSSProperties => ({
  border: primary ? "1.5px solid var(--portal-emerald)" : "1.5px solid rgba(22,48,43,0.12)",
  background: primary ? "var(--portal-emerald)" : "#fff",
  color: primary ? "#fff" : "rgba(22,48,43,0.8)",
  borderRadius: 999,
  padding: "7px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.65)", display: "block", marginBottom: 4 };

const STATUS: Record<Status, { text: string; color: string; bg: string }> = {
  match: { text: "Match", color: "#2F6D46", bg: "#EAF3EF" },
  close: { text: "Close", color: "#A57420", bg: "#FBF0DC" },
  off: { text: "Off", color: "#B5566B", bg: "#F8E8EC" },
  error: { text: "Can't compare", color: "rgba(22,48,43,0.6)", bg: "rgba(22,48,43,0.06)" },
  "not-run": { text: "Not run", color: "rgba(22,48,43,0.45)", bg: "rgba(22,48,43,0.04)" },
};

function fmt(v: number | null, unit: Unit | null) {
  if (v == null) return "—";
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  if (unit === "money") return `${v < 0 ? "-" : ""}$${Math.abs(n).toLocaleString()}`;
  if (unit === "pct") return `${n}%`;
  const s = n.toLocaleString();
  if (unit === "hours") return `${s} hrs`;
  if (unit === "lbs") return `${s} lbs`;
  return s;
}

const blankForm = { id: "", label: "", report_key: "", kpi_label: "", dataset_id: "", dax: "", tolerance_pct: 1, notes: "", is_active: true };

export default function PowerBiCompareClient({ reports }: { reports: { key: string; title: string }[] }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [conn, setConn] = useState<Conn>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null); // "all" or a metric id
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<typeof blankForm | null>(null);
  const [explore, setExplore] = useState(false);

  const reportTitle = useMemo(() => new Map(reports.map((r) => [r.key, r.title])), [reports]);
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, []);

  useEffect(() => {
    fetch("/api/admin/powerbi/status")
      .then((r) => r.json())
      .then(setConn)
      .catch(() => setConn({ connected: false, reason: "error", error: "Couldn't check the connection", datasets: [] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ year: String(year), ...(month ? { month: String(month) } : {}) });
    const res = await fetch(`/api/admin/powerbi/compare?${qs}`);
    const body = await res.json();
    if (res.ok) {
      setMetrics(body.metrics);
      setResults(body.results);
      setHistory(body.history);
    } else setError(body.error);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(metricId?: string) {
    setRunning(metricId ?? "all");
    setError(null);
    const res = await fetch("/api/admin/powerbi/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, metricId }),
    });
    const body = await res.json();
    if (res.ok) {
      setMetrics(body.metrics);
      setResults(body.results);
      setHistory(body.history);
    } else setError(body.error);
    setRunning(null);
  }

  async function remove(id: string) {
    if (!confirm("Remove this metric and its history?")) return;
    await fetch(`/api/admin/powerbi/metrics/${id}`, { method: "DELETE" });
    setOpen(null);
    load();
  }

  const counts = useMemo(() => {
    const c: Record<Status, number> = { match: 0, close: 0, off: 0, error: 0, "not-run": 0 };
    for (const r of results) c[r.status]++;
    return c;
  }, [results]);
  const lastRun = results.map((r) => r.runAt).filter(Boolean).sort().pop();
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const inactive = metrics.filter((m) => !m.is_active);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Power BI check</h1>
        <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5" style={{ background: "#FBF0DC", color: "#A57420" }}>
          Temporary
        </span>
      </div>
      <p className="text-sm mb-5" style={{ color: "rgba(22,48,43,0.55)" }}>
        Each portal number next to the same number in Power BI, so we can see where the portal is still short. Read-only — nothing is changed in Power BI.
      </p>

      <ConnectionBanner conn={conn} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={input} aria-label="Year">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={month ?? ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)} style={input} aria-label="Month">
          <option value="">Whole year</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <button onClick={() => run()} disabled={!!running || !results.length} style={{ ...btn(true), opacity: running || !results.length ? 0.6 : 1 }}>
          {running === "all" ? "Comparing…" : "Compare now"}
        </button>
        <button onClick={() => setForm({ ...blankForm })} style={btn()}>
          + Add metric
        </button>
        <span className="text-xs ml-auto" style={{ color: "rgba(22,48,43,0.45)" }}>
          {lastRun ? `Last compared ${new Date(lastRun).toLocaleString()}` : "Runs automatically every morning"}
        </span>
      </div>

      {error && (
        <p className="text-sm mb-4 rounded-xl px-4 py-2.5" style={{ background: "#F8E8EC", color: "#B5566B" }}>
          {error}
        </p>
      )}

      {form && (
        <MetricEditor
          key={form.id || "new"}
          initial={form}
          reports={reports}
          datasets={conn?.datasets ?? []}
          year={year}
          month={month}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}

      {/* Summary */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {(["match", "close", "off", "error"] as Status[])
            .filter((s) => counts[s] > 0)
            .map((s) => (
              <span key={s} className="text-xs font-semibold rounded-full px-3 py-1" style={{ background: STATUS[s].bg, color: STATUS[s].color }}>
                {counts[s]} {STATUS[s].text.toLowerCase()}
              </span>
            ))}
        </div>
      )}

      {/* Results */}
      <div style={card} className="overflow-hidden mb-6">
        {loading ? (
          <p className="text-sm p-6" style={{ color: "rgba(22,48,43,0.45)" }}>
            Loading…
          </p>
        ) : results.length === 0 ? (
          <EmptyState onAdd={() => setForm({ ...blankForm })} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "rgba(22,48,43,0.5)", fontSize: 12, textAlign: "left" }}>
                  <th className="px-5 py-3 font-semibold">Metric</th>
                  <th className="px-3 py-3 font-semibold text-right">Portal</th>
                  <th className="px-3 py-3 font-semibold text-right">Power BI</th>
                  <th className="px-3 py-3 font-semibold text-right">Gap</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const m = metricById.get(r.metricId);
                  const isOpen = open === r.metricId;
                  return (
                    <ResultRow
                      key={r.metricId}
                      r={r}
                      m={m}
                      reportTitle={m ? reportTitle.get(m.report_key) ?? m.report_key : ""}
                      history={history[r.metricId] ?? []}
                      open={isOpen}
                      running={running === r.metricId}
                      onToggle={() => setOpen(isOpen ? null : r.metricId)}
                      onRun={() => run(r.metricId)}
                      onEdit={() => m && setForm({ ...blankForm, ...m, notes: m.notes ?? "" })}
                      onRemove={() => remove(r.metricId)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inactive.length > 0 && (
        <p className="text-xs mb-6" style={{ color: "rgba(22,48,43,0.5)" }}>
          Paused:{" "}
          {inactive.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ", "}
              <button className="underline" onClick={() => setForm({ ...blankForm, ...m, notes: m.notes ?? "" })}>
                {m.label}
              </button>
            </span>
          ))}
        </p>
      )}

      {/* Explorer */}
      <div style={card} className="mb-6">
        <button onClick={() => setExplore((x) => !x)} className="w-full flex items-center justify-between px-5 py-4 text-left">
          <span className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
            Explore Power BI data
          </span>
          <span className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
            {explore ? "Hide" : "Run a DAX query against a model"}
          </span>
        </button>
        {explore && <Explorer datasets={conn?.datasets ?? []} year={year} month={month} />}
      </div>
    </div>
  );
}

function ConnectionBanner({ conn }: { conn: Conn }) {
  if (!conn) return null;
  if (conn.connected) {
    return (
      <p className="text-xs mb-4" style={{ color: "#2F6D46" }}>
        ● Connected to Power BI · {conn.datasets.length} model{conn.datasets.length === 1 ? "" : "s"} available
      </p>
    );
  }
  return (
    <div className="rounded-2xl px-4 py-3 mb-4 text-sm" style={{ background: "#FBF0DC", color: "#7A5617" }}>
      {conn.reason === "not-configured" ? (
        <>
          Power BI isn&apos;t connected yet. Add the app&apos;s keys under{" "}
          <Link href="/admin/connectors#powerbi" className="font-semibold underline">
            Settings → Connectors → Power BI
          </Link>
          . You can set up metrics now; they&apos;ll compare once it&apos;s connected.
        </>
      ) : (
        <>
          Couldn&apos;t reach Power BI: {conn.error}{" "}
          <Link href="/admin/connectors#powerbi" className="font-semibold underline">
            Check the keys
          </Link>
        </>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.7)" }}>
      <p className="font-semibold mb-2" style={{ color: "#16302B" }}>
        No metrics yet
      </p>
      <p className="mb-1">A metric pairs one portal number with one Power BI number:</p>
      <ol className="list-decimal ml-5 mb-4 space-y-0.5">
        <li>Pick the portal report and tile (for example Back2School → Backpacks).</li>
        <li>Pick the Power BI model and write a DAX query that returns the same number.</li>
        <li>Test it, save, and it&apos;s compared every morning.</li>
      </ol>
      <button onClick={onAdd} style={btn(true)}>
        + Add your first metric
      </button>
    </div>
  );
}

function ResultRow({
  r,
  m,
  reportTitle,
  history,
  open,
  running,
  onToggle,
  onRun,
  onEdit,
  onRemove,
}: {
  r: Result;
  m: Metric | undefined;
  reportTitle: string;
  history: HistoryPoint[];
  open: boolean;
  running: boolean;
  onToggle: () => void;
  onRun: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const s = STATUS[r.status];
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer" style={{ borderTop: "1px solid rgba(22,48,43,0.07)", background: open ? "rgba(22,48,43,0.02)" : undefined }}>
        <td className="px-5 py-3">
          <div className="font-semibold" style={{ color: "#16302B" }}>
            {r.label}
          </div>
          <div className="text-[11px]" style={{ color: "rgba(22,48,43,0.45)" }}>
            {reportTitle} · {m?.kpi_label}
          </div>
        </td>
        <td className="px-3 py-3 text-right tabular-nums">{fmt(r.portal, r.unit)}</td>
        <td className="px-3 py-3 text-right tabular-nums">{fmt(r.pbi, r.unit)}</td>
        <td className="px-3 py-3 text-right tabular-nums" style={{ color: r.diff && r.status !== "match" ? s.color : "rgba(22,48,43,0.5)" }}>
          {r.diff == null ? "—" : `${r.diff > 0 ? "+" : ""}${fmt(r.diff, r.unit)}`}
          {r.diffPct != null && r.status !== "match" && <div className="text-[11px]">{`${r.diffPct > 0 ? "+" : ""}${r.diffPct.toFixed(1)}%`}</div>}
        </td>
        <td className="px-5 py-3">
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
            {s.text}
          </span>
        </td>
      </tr>
      {open && (
        <tr style={{ background: "rgba(22,48,43,0.02)" }}>
          <td colSpan={5} className="px-5 pb-4 pt-1">
            {(r.portalError || r.pbiError) && (
              <div className="text-xs mb-3 space-y-1">
                {r.portalError && (
                  <p>
                    <span className="font-semibold">Portal:</span> {r.portalError}
                  </p>
                )}
                {r.pbiError && (
                  <p>
                    <span className="font-semibold">Power BI:</span> {r.pbiError}
                  </p>
                )}
              </div>
            )}
            {history.length > 1 && (
              <div className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.65)" }}>
                <span className="font-semibold">Gap over time: </span>
                {history
                  .slice(0, 6)
                  .reverse()
                  .map((h) => {
                    const gap = h.portal != null && h.pbi != null ? h.portal - h.pbi : null;
                    return `${new Date(h.run_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${gap == null ? "—" : fmt(gap, r.unit)}`;
                  })
                  .join("  ·  ")}
              </div>
            )}
            {m?.notes && (
              <p className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.65)" }}>
                {m.notes}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={onRun} disabled={running} style={btn()}>
                {running ? "Comparing…" : "Compare this one"}
              </button>
              <button onClick={onEdit} style={btn()}>
                Edit
              </button>
              {m && (
                <Link href={`/admin/insights/reports/${m.report_key}`} style={btn()}>
                  Open report
                </Link>
              )}
              <button onClick={onRemove} style={{ ...btn(), color: "#B5566B" }}>
                Remove
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MetricEditor({
  initial,
  reports,
  datasets,
  year,
  month,
  onCancel,
  onSaved,
}: {
  initial: typeof blankForm;
  reports: { key: string; title: string }[];
  datasets: Dataset[];
  year: number;
  month: number | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const [kpis, setKpis] = useState<{ label: string; value: number | null; unit: Unit }[] | null>(null);
  const [test, setTest] = useState<{ value?: number | null; error?: string; query?: string } | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!f.report_key) return setKpis(null);
    setKpis(null);
    fetch(`/api/admin/powerbi/kpis?report=${encodeURIComponent(f.report_key)}&year=${year}`)
      .then((r) => r.json())
      .then((b) => setKpis(b.kpis ?? []));
  }, [f.report_key, year]);

  const set = (patch: Partial<typeof blankForm>) => setF((x) => ({ ...x, ...patch }));
  const portalTile = kpis?.find((k) => k.label === f.kpi_label);

  async function runTest() {
    setBusy("test");
    setTest(null);
    const res = await fetch("/api/admin/powerbi/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId: f.dataset_id, dax: f.dax, year, month }),
    });
    const b = await res.json();
    setTest(res.ok ? { value: b.value, query: b.query, error: b.value == null ? "The query ran but returned no number" : undefined } : { error: b.error, query: b.query });
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    setErr(null);
    const res = await fetch(f.id ? `/api/admin/powerbi/metrics/${f.id}` : "/api/admin/powerbi/metrics", {
      method: f.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, dataset_name: datasets.find((d) => d.id === f.dataset_id)?.name ?? null }),
    });
    const b = await res.json();
    setBusy(null);
    if (!res.ok) return setErr(b.error);
    onSaved();
  }

  return (
    <div style={card} className="p-5 mb-5">
      <h2 className="text-base font-bold mb-4" style={{ color: "#2F4A3E" }}>
        {f.id ? "Edit metric" : "New metric"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span style={label}>Name</span>
          <input value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Backpacks distributed" style={{ ...input, width: "100%" }} />
        </div>

        <div>
          <span style={label}>Portal report</span>
          <select value={f.report_key} onChange={(e) => set({ report_key: e.target.value, kpi_label: "" })} style={{ ...input, width: "100%" }}>
            <option value="">Choose…</option>
            {reports.map((r) => (
              <option key={r.key} value={r.key}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span style={label}>Portal tile</span>
          <select value={f.kpi_label} onChange={(e) => set({ kpi_label: e.target.value })} style={{ ...input, width: "100%" }} disabled={!kpis}>
            <option value="">{f.report_key && !kpis ? "Loading…" : "Choose…"}</option>
            {/* keep a saved tile selectable even if the report no longer has it */}
            {f.kpi_label && kpis && !kpis.some((k) => k.label === f.kpi_label) && <option value={f.kpi_label}>{f.kpi_label} (not found)</option>}
            {kpis?.map((k) => (
              <option key={k.label} value={k.label}>
                {k.label}
              </option>
            ))}
          </select>
          {portalTile && (
            <p className="text-[11px] mt-1" style={{ color: "rgba(22,48,43,0.5)" }}>
              Portal shows {fmt(portalTile.value, portalTile.unit)} for {year}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <span style={label}>Power BI model</span>
          {datasets.length ? (
            <select value={f.dataset_id} onChange={(e) => set({ dataset_id: e.target.value })} style={{ ...input, width: "100%" }}>
              <option value="">Choose…</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <input value={f.dataset_id} onChange={(e) => set({ dataset_id: e.target.value })} placeholder="Model (dataset) ID — the list appears once Power BI is connected" style={{ ...input, width: "100%" }} />
          )}
        </div>

        <div className="sm:col-span-2">
          <span style={label}>DAX query (returns one number)</span>
          <textarea
            value={f.dax}
            onChange={(e) => set({ dax: e.target.value })}
            rows={5}
            spellCheck={false}
            placeholder={`EVALUATE ROW("Value", CALCULATE(SUM('Distributions'[Backpacks]), 'Distributions'[Date] >= {start}, 'Distributions'[Date] <= {end}))`}
            style={{ ...input, width: "100%", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}
          />
          <p className="text-[11px] mt-1" style={{ color: "rgba(22,48,43,0.5)" }}>
            <code>{"{start}"}</code> and <code>{"{end}"}</code> become the first and last day of the year or month you&apos;re comparing; <code>{"{year}"}</code> becomes the year. Copy a measure&apos;s formula from Power BI Desktop if one already exists.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button onClick={runTest} disabled={!f.dataset_id || !f.dax || busy === "test"} style={{ ...btn(), opacity: !f.dataset_id || !f.dax ? 0.5 : 1 }}>
              {busy === "test" ? "Testing…" : `Test for ${month ? `${MONTHS[month - 1]} ` : ""}${year}`}
            </button>
            {test && (
              <span className="text-xs" style={{ color: test.error ? "#B5566B" : "#2F6D46" }}>
                {test.error ?? `Power BI returns ${fmt(test.value ?? null, portalTile?.unit ?? null)}`}
              </span>
            )}
          </div>
        </div>

        <div>
          <span style={label}>Counts as a match within</span>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} step={0.5} value={f.tolerance_pct} onChange={(e) => set({ tolerance_pct: Number(e.target.value) })} style={{ ...input, width: 90 }} />
            <span className="text-sm">%</span>
          </div>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            Include in comparisons
          </label>
        </div>

        <div className="sm:col-span-2">
          <span style={label}>Notes (optional)</span>
          <input value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Power BI counts refunds; portal doesn't yet" style={{ ...input, width: "100%" }} />
        </div>
      </div>

      {err && (
        <p className="text-sm mt-3" style={{ color: "#B5566B" }}>
          {err}
        </p>
      )}
      <div className="flex gap-2 mt-5">
        <button onClick={save} disabled={busy === "save"} style={btn(true)}>
          {busy === "save" ? "Saving…" : "Save metric"}
        </button>
        <button onClick={onCancel} style={btn()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Explorer({ datasets, year, month }: { datasets: Dataset[]; year: number; month: number | null }) {
  const [datasetId, setDatasetId] = useState("");
  const [dax, setDax] = useState("EVALUATE COLUMNSTATISTICS()");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ rows?: Record<string, unknown>[]; rowCount?: number; error?: string } | null>(null);

  async function go() {
    setBusy(true);
    const res = await fetch("/api/admin/powerbi/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId, dax, year, month }),
    });
    setOut(await res.json());
    setBusy(false);
  }

  const cols = out?.rows?.length ? Object.keys(out.rows[0]) : [];

  function copyCsv() {
    if (!out?.rows) return;
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.map(cell).join(","), ...out.rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="px-5 pb-5">
      <div className="flex flex-wrap gap-2 mb-2">
        <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} style={input}>
          <option value="">{datasets.length ? "Choose a model…" : "Connect Power BI to list models"}</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button onClick={go} disabled={!datasetId || !dax || busy} style={{ ...btn(true), opacity: !datasetId || !dax ? 0.5 : 1 }}>
          {busy ? "Running…" : "Run"}
        </button>
      </div>
      <textarea
        value={dax}
        onChange={(e) => setDax(e.target.value)}
        rows={4}
        spellCheck={false}
        style={{ ...input, width: "100%", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}
      />
      <p className="text-[11px] mt-1 mb-3" style={{ color: "rgba(22,48,43,0.5)" }}>
        <code>EVALUATE COLUMNSTATISTICS()</code> lists every table and column in the model. <code>EVALUATE TOPN(20, &apos;Table Name&apos;)</code> shows sample rows from one table.
      </p>
      {out?.error && (
        <p className="text-sm" style={{ color: "#B5566B" }}>
          {out.error}
        </p>
      )}
      {out?.rows && (
        <div className="overflow-auto rounded-xl" style={{ border: "1px solid rgba(22,48,43,0.08)", maxHeight: 480 }}>
          <table className="text-xs w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ background: "rgba(22,48,43,0.04)" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {out.rows.map((row, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(22,48,43,0.06)" }}>
                  {cols.map((c) => (
                    <td key={c} className="px-3 py-1.5 whitespace-nowrap">
                      {row[c] == null ? "" : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="text-[11px]" style={{ color: "rgba(22,48,43,0.5)" }}>
              {out.rowCount} row{out.rowCount === 1 ? "" : "s"}
              {out.rowCount && out.rowCount > 1000 ? " (first 1,000 shown)" : ""}
            </span>
            <button onClick={copyCsv} className="text-[11px] font-semibold underline" style={{ color: "var(--portal-emerald)" }}>
              {copied ? "Copied" : "Copy as CSV"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
