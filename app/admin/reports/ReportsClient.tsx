"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReportModule } from "@/lib/reports/registry";

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};
const pillButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
});

type RunResult = {
  dimension_labels: string[];
  metric_labels: string[];
  rows: { dimensions: unknown[]; metrics: (number | null)[] }[];
  row_count: number;
  error?: string;
};

type SavedReport = {
  id: string;
  module_slug: string;
  name: string;
  description: string | null;
  dimensions: string[];
  metrics: string[];
  filters: { date_from?: string; date_to?: string; office_id?: string };
};

type Office = { id: string; field_office: string; region: string };

export default function ReportsClient({ modules, offices }: { modules: ReportModule[]; offices: Office[] }) {
  const [moduleSlug, setModuleSlug] = useState(modules[0]?.slug ?? "");
  const mod = useMemo(() => modules.find((m) => m.slug === moduleSlug), [modules, moduleSlug]);

  const [selectedDims, setSelectedDims] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [officeId, setOfficeId] = useState("");

  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportName, setReportName] = useState("");
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);

  const [showScheduleFields, setShowScheduleFields] = useState(false);
  const [schedule, setSchedule] = useState<"" | "daily" | "weekly" | "monthly">("");
  const [recipients, setRecipients] = useState("");

  useEffect(() => {
    setSelectedDims([]);
    setSelectedMetrics([]);
    setResult(null);
  }, [moduleSlug]);

  useEffect(() => {
    fetch("/api/reports/definitions")
      .then((r) => r.json())
      .then((d) => setSavedReports(d.reports ?? []))
      .catch(() => {});
  }, []);

  function toggle(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  }

  function currentFilters() {
    return { date_from: dateFrom || undefined, date_to: dateTo || undefined, office_id: officeId || undefined };
  }

  async function runReport() {
    if (!mod) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_slug: mod.slug, dimensions: selectedDims, metrics: selectedMetrics, filters: currentFilters() }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    if (!mod) return;
    setExporting(true);
    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_slug: mod.slug, dimensions: selectedDims, metrics: selectedMetrics, filters: currentFilters() }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mod.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function saveReport() {
    if (!mod || !reportName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reports/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module_slug: mod.slug,
          name: reportName.trim(),
          dimensions: selectedDims,
          metrics: selectedMetrics,
          filters: currentFilters(),
          visibility: "private",
          schedule: schedule || null,
          schedule_recipients: recipients
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.report) {
        setSavedReports((prev) => [data.report, ...prev]);
        setReportName("");
        setSchedule("");
        setRecipients("");
        setShowScheduleFields(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function loadSaved(r: SavedReport) {
    setModuleSlug(r.module_slug);
    setSelectedDims(r.dimensions);
    setSelectedMetrics(r.metrics);
    setDateFrom(r.filters?.date_from ?? "");
    setDateTo(r.filters?.date_to ?? "");
    setOfficeId(r.filters?.office_id ?? "");
    setResult(null);
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {savedReports.length > 0 && (
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Saved Reports</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {savedReports.map((r) => (
              <button key={r.id} onClick={() => loadSaved(r)} style={pillButton(false)}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, padding: 20, display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Report Type</div>
          <select value={moduleSlug} onChange={(e) => setModuleSlug(e.target.value)} style={inputStyle}>
            {modules.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {mod && (
          <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Group By</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {mod.dimensions.map((d) => (
                  <button key={d.key} onClick={() => toggle(selectedDims, setSelectedDims, d.key)} style={pillButton(selectedDims.includes(d.key))}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Metrics</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {mod.metrics.map((m) => (
                  <button key={m.key} onClick={() => toggle(selectedMetrics, setSelectedMetrics, m.key)} style={pillButton(selectedMetrics.includes(m.key))}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>From</div>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>To</div>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
              </div>
              {offices.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Office</div>
                  <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={inputStyle}>
                    <option value="">All offices you can see</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.field_office}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={runReport}
                disabled={loading || (selectedDims.length === 0 && selectedMetrics.length === 0)}
                style={{ ...pillButton(true), padding: "9px 20px", opacity: loading ? 0.6 : 1 }}
              >
                {loading ? "Running…" : "Run Report"}
              </button>
              <button
                onClick={exportCsv}
                disabled={exporting || (selectedDims.length === 0 && selectedMetrics.length === 0)}
                style={{ ...pillButton(false), opacity: exporting ? 0.6 : 1 }}
              >
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>

            <div style={{ borderTop: "1px solid rgba(22,48,43,0.08)", paddingTop: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input
                  placeholder="Name this report to save it…"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={() => setShowScheduleFields((v) => !v)} style={pillButton(showScheduleFields)}>
                  {showScheduleFields ? "Hide schedule" : "+ Schedule email"}
                </button>
                <button onClick={saveReport} disabled={saving || !reportName.trim()} style={pillButton(false)}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>

              {showScheduleFields && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <select value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)} style={inputStyle}>
                    <option value="">No recurring email</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly (Mondays)</option>
                    <option value="monthly">Monthly (1st)</option>
                  </select>
                  <input
                    placeholder="Recipient emails, comma separated"
                    value={recipients}
                    onChange={(e) => setRecipients(e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 240 }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {result && (
        <div style={{ ...cardStyle, padding: 20 }}>
          {result.error ? (
            <div style={{ color: "#B5566B", fontSize: 14 }}>{result.error}</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "rgba(22,48,43,0.55)", marginBottom: 12 }}>{result.row_count} matching records</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr>
                    {result.dimension_labels.map((l) => (
                      <th key={l} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1.5px solid rgba(22,48,43,0.1)" }}>
                        {l}
                      </th>
                    ))}
                    {result.metric_labels.map((l) => (
                      <th key={l} style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1.5px solid rgba(22,48,43,0.1)" }}>
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {row.dimensions.map((v, j) => (
                        <td key={j} style={{ padding: "8px 10px", borderBottom: "1px solid rgba(22,48,43,0.06)" }}>
                          {String(v)}
                        </td>
                      ))}
                      {row.metrics.map((v, j) => (
                        <td key={j} style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid rgba(22,48,43,0.06)" }}>
                          {typeof v === "number" ? Math.round(v * 100) / 100 : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
