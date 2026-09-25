"use client";

import { useEffect, useState } from "react";
import { btn, card, dim, Empty, H1, ink, input, labelStyle, line } from "../ui";

export default function ResourcesSettings() {
  const [d, setD] = useState<any>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  const load = () =>
    fetch("/api/resources/settings")
      .then((r) => r.json())
      .then((j) => {
        setD(j);
        if (j.departments) setDrafts(Object.fromEntries(j.departments.map((x: any) => [x.id, (x.emails ?? []).join(", ")])));
      });
  useEffect(() => {
    load();
  }, []);

  if (!d) return <Empty>Loading…</Empty>;
  if (d.error) return <Empty>{d.error}</Empty>;

  return (
    <div>
      <H1>Notification settings</H1>
      <p style={{ fontSize: 14, color: dim, margin: "-6px 0 16px", maxWidth: 760 }}>
        Who gets emailed when vehicles, properties, drivers, documents or insurance change. Each office's regional director and area
        manager are added automatically from their portal accounts.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 20 }}>
        {d.departments.map((dep: any) => (
          <section key={dep.id} style={card}>
            <label style={{ ...labelStyle, fontSize: 14, color: ink }} htmlFor={`dep-${dep.id}`}>
              {dep.label}
            </label>
            <textarea
              id={`dep-${dep.id}`}
              rows={2}
              style={input}
              placeholder="name@icnarelief.org, another@icnarelief.org"
              value={drafts[dep.id] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [dep.id]: e.target.value })}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button
                style={{ ...btn, padding: "6px 12px", fontSize: 13 }}
                onClick={async () => {
                  const r = await fetch("/api/resources/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department: dep.id, emails: drafts[dep.id] }) });
                  const j = await r.json();
                  setMsg({ ...msg, [dep.id]: r.ok ? { ok: true, text: "Saved" } : { ok: false, text: j.error } });
                }}
              >
                Save
              </button>
              {msg[dep.id] && <span style={{ fontSize: 13, color: msg[dep.id].ok ? "#15803D" : "#B3261E" }}>{msg[dep.id].text}</span>}
            </div>
          </section>
        ))}
      </div>

      <section style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Who hears about what</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: dim, fontSize: 12 }}>
                <th style={{ padding: "6px 8px" }}>Event</th>
                {d.departments.map((x: any) => (
                  <th key={x.id} style={{ padding: "6px 8px" }}>
                    {x.label.replace(/ \(.+\)$/, "")}
                  </th>
                ))}
                <th style={{ padding: "6px 8px" }}>Regional director</th>
                <th style={{ padding: "6px 8px" }}>Area manager</th>
              </tr>
            </thead>
            <tbody>
              {d.matrix.map((m: any) => (
                <tr key={m.event} style={{ borderTop: `1px solid ${line}` }}>
                  <td style={{ padding: "6px 8px" }}>{m.label}</td>
                  {d.departments.map((x: any) => (
                    <td key={x.id} style={{ padding: "6px 8px", color: "#15803D", fontWeight: 700 }}>
                      {m.depts.includes(x.id) ? "✓" : ""}
                    </td>
                  ))}
                  <td style={{ padding: "6px 8px", color: "#15803D", fontWeight: 700 }}>{m.rd ? "✓" : ""}</td>
                  <td style={{ padding: "6px 8px", color: "#15803D", fontWeight: 700 }}>{m.am ? "✓" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Notification history (latest 50)</h2>
        {d.log.length === 0 ? (
          <Empty>No notifications yet.</Empty>
        ) : (
          d.log.map((l: any) => (
            <div key={l.id} style={{ padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <b style={{ color: ink }}>{l.subject}</b>
                <span style={{ fontWeight: 700, color: l.status === "sent" ? "#15803D" : l.status === "failed" ? "#B3261E" : "#92400E" }}>{l.status}</span>
              </div>
              <div style={{ color: dim, fontSize: 12 }}>
                {new Date(l.created_at).toLocaleString()} · {l.recipients.length} recipient{l.recipients.length === 1 ? "" : "s"}
                {l.error ? ` · ${l.error}` : ""}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
