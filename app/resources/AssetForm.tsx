"use client";

import { useState } from "react";
import { ASSETS, US_STATES, type AssetType, type Field } from "@/lib/resources/schema";
import { btn, input, labelStyle, dim } from "./ui";

export default function AssetForm({
  type,
  initial = {},
  drivers = [],
  offices,
  submitLabel,
  onSubmit,
}: {
  type: AssetType;
  initial?: Record<string, any>;
  drivers?: { id: string; full_name: string }[];
  offices?: { id: string; field_office: string }[];
  submitLabel: string;
  onSubmit: (values: Record<string, any>) => Promise<string | null>; // returns an error message or null
}) {
  const cfg = ASSETS[type];
  const [v, setV] = useState<Record<string, any>>(() => ({ ...initial }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));

  const control = (f: Field) => {
    const common = { id: `f-${f.key}`, style: input, value: v[f.key] ?? "", required: f.required, placeholder: f.placeholder };
    switch (f.kind) {
      case "textarea":
        return <textarea {...common} rows={3} onChange={(e) => set(f.key, e.target.value)} />;
      case "select":
        return (
          <select {...common} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">—</option>
            {f.options!.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "state":
        return (
          <select {...common} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        );
      case "driver":
        return (
          <select {...common} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">No primary driver</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        );
      case "date":
        return <input {...common} type="date" onChange={(e) => set(f.key, e.target.value)} />;
      case "number":
      case "money":
        return <input {...common} type="number" step={f.kind === "money" ? "0.01" : "1"} min={0} onChange={(e) => set(f.key, e.target.value)} />;
      default:
        return <input {...common} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        const m = await onSubmit(v);
        setBusy(false);
        if (m) setErr(m);
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {offices && (
          <div>
            <label style={labelStyle} htmlFor="f-office">
              Office *
            </label>
            <select id="f-office" style={input} required value={v.office_id ?? ""} onChange={(e) => set("office_id", e.target.value)}>
              <option value="">Choose…</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.field_office}
                </option>
              ))}
            </select>
          </div>
        )}
        {cfg.fields.map((f) => (
          <div key={f.key} style={f.kind === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
            <label style={labelStyle} htmlFor={`f-${f.key}`}>
              {f.label}
              {f.required ? " *" : ""}
            </label>
            {control(f)}
            {f.help && <p style={{ fontSize: 12, color: dim, margin: "4px 0 0" }}>{f.help}</p>}
          </div>
        ))}
      </div>
      {err && (
        <p role="alert" style={{ color: "#B3261E", fontSize: 14, fontWeight: 600, margin: "14px 0 0" }}>
          {err}
        </p>
      )}
      <button type="submit" style={{ ...btn, marginTop: 16, opacity: busy ? 0.6 : 1 }} disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
