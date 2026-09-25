"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASSETS, isAssetType } from "@/lib/resources/schema";
import { btn, btnGhost, card, DaysPill, dim, Empty, fmtDate, H1, ink, input, line, money } from "../ui";

const daysUntil = (d: string) => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / 86400000);

export default function AssetList() {
  const { type } = useParams<{ type: string }>();
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isAssetType(type)) return;
    setRows(null);
    fetch(`/api/resources/${type}?status=${status}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json()).error)))
      .then((d) => setRows(d.rows))
      .catch((e) => setErr(String(e)));
  }, [type, status]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())), [rows, q]);
  if (!isAssetType(type)) return <Empty>Not found.</Empty>;
  const cfg = ASSETS[type];
  const cols = cfg.fields.filter((f) => f.list);
  const expiry = cfg.expiries[0]?.key;

  return (
    <div>
      <H1
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <a href={`/api/resources/${type}?status=${status}&format=csv`} style={btnGhost}>
              Export to Excel (CSV)
            </a>
            <Link href={`/resources/${type}/new`} style={btn}>
              + Add {cfg.singular.toLowerCase()}
            </Link>
          </div>
        }
      >
        {cfg.plural}
      </H1>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input style={{ ...input, maxWidth: 320 }} placeholder={`Search ${cfg.plural.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select style={{ ...input, width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="active">Active</option>
          <option value="removed">Removed</option>
          <option value="all">All</option>
        </select>
      </div>
      {err && <Empty>{err}</Empty>}
      {!rows && !err && <Empty>Loading…</Empty>}
      {rows && shown.length === 0 && <Empty>No {cfg.plural.toLowerCase()} yet. Add the first one.</Empty>}
      {shown.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: dim, fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>Office</th>
                {cols.map((c) => (
                  <th key={c.key} style={{ padding: "10px 14px" }}>
                    {c.label}
                  </th>
                ))}
                <th style={{ padding: "10px 14px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${line}` }}>
                  <td style={{ padding: "10px 14px", color: dim }}>{r.office_name}</td>
                  {cols.map((c, i) => {
                    const val = r[c.key];
                    let content: React.ReactNode = val ?? "—";
                    if (c.kind === "date") content = val ? fmtDate(val) : "—";
                    if (c.kind === "money") content = money(val);
                    if (c.kind === "select") content = c.options?.find((o) => o.value === val)?.label ?? "—";
                    return (
                      <td key={c.key} style={{ padding: "10px 14px", color: ink }}>
                        {i === 0 ? (
                          <Link href={`/resources/${type}/${r.id}`} style={{ fontWeight: 600, color: ink }}>
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                        {c.key === expiry && val && r.status === "active" && daysUntil(val) <= 90 && (
                          <span style={{ marginLeft: 8 }}>
                            <DaysPill days={daysUntil(val)} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "10px 14px", color: r.status === "active" ? "#15803D" : dim, fontWeight: 600 }}>{r.status === "active" ? "Active" : "Removed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
