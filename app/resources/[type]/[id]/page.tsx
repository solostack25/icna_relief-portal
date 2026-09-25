"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ASSETS, DOC_TYPES, isAssetType } from "@/lib/resources/schema";
import AssetForm from "../../AssetForm";
import { btn, btnGhost, card, DaysPill, dim, Empty, fmtDate, H1, ink, input, labelStyle, line, money, StatusPill } from "../../ui";

const daysUntil = (d: string) => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / 86400000);

type Detail = {
  asset: Record<string, any>;
  policies: any[];
  documents: any[];
  requests: any[];
  activity: any[];
  drivers: { id: string; full_name: string }[];
  canWrite: boolean;
  canManage: boolean;
};

export default function AssetDetail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const created = useSearchParams().get("created");
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/resources/${type}/${id}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json()).error)))
      .then(setD)
      .catch((e) => setErr(String(e)));
  }, [type, id]);
  useEffect(load, [load]);

  if (!isAssetType(type)) return <Empty>Not found.</Empty>;
  if (err) return <Empty>{err}</Empty>;
  if (!d) return <Empty>Loading…</Empty>;
  const cfg = ASSETS[type];
  const a = d.asset;
  const active = a.status === "active";

  return (
    <div>
      <Link href={`/resources/${type}`} style={{ fontSize: 13, color: dim }}>
        ← {cfg.plural}
      </Link>
      <H1
        right={
          d.canWrite && active && !editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnGhost} onClick={() => setEditing(true)}>
                Edit
              </button>
              <button style={{ ...btnGhost, color: "#B3261E" }} onClick={() => setRemoving(true)}>
                Remove…
              </button>
            </div>
          ) : null
        }
      >
        {a.title}
      </H1>
      <p style={{ margin: "-8px 0 16px", fontSize: 14, color: dim }}>
        {cfg.singular} · {a.office_name}
        {!active && (
          <b style={{ color: "#B3261E" }}>
            {" "}
            · Removed {fmtDate(a.removed_on)}: {a.removed_reason}
          </b>
        )}
      </p>
      {created && (
        <div style={{ ...card, background: "#EEF6F1", marginBottom: 14, fontSize: 14 }}>
          Saved. Insurance request <b>{created}</b> was created automatically, and the notification went out.{" "}
          <Link href="/resources/requests" style={{ fontWeight: 600 }}>
            View insurance requests →
          </Link>
        </div>
      )}

      {removing && <RemoveBox type={type} id={id} singular={cfg.singular} onDone={() => { setRemoving(false); load(); }} onCancel={() => setRemoving(false)} />}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16, alignItems: "start" }} className="res-detail-grid">
        <div style={{ display: "grid", gap: 16 }}>
          <section style={card}>
            <h2 style={{ fontSize: 16, margin: "0 0 12px", color: ink }}>Details</h2>
            {editing ? (
              <AssetForm
                type={type}
                initial={a}
                drivers={d.drivers}
                submitLabel="Save changes"
                onSubmit={async (values) => {
                  const r = await fetch(`/api/resources/${type}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
                  const j = await r.json();
                  if (!r.ok) return j.error ?? "Couldn't save.";
                  setEditing(false);
                  load();
                  return null;
                }}
              />
            ) : (
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px 18px", margin: 0 }}>
                {cfg.fields.map((f) => {
                  let v: React.ReactNode = a[f.key] ?? "—";
                  if (f.kind === "date") v = a[f.key] ? fmtDate(a[f.key]) : "—";
                  if (f.kind === "money") v = money(a[f.key]);
                  if (f.kind === "select") v = f.options?.find((o) => o.value === a[f.key])?.label ?? "—";
                  if (f.kind === "driver") v = d.drivers.find((x) => x.id === a[f.key])?.full_name ?? "—";
                  const exp = cfg.expiries.some((e) => e.key === f.key) && a[f.key] && active;
                  return (
                    <div key={f.key} style={f.kind === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                      <dt style={{ fontSize: 12, color: dim }}>{f.label}</dt>
                      <dd style={{ margin: "2px 0 0", fontSize: 14, color: ink, whiteSpace: "pre-line" }}>
                        {v} {exp && daysUntil(a[f.key]) <= 90 && <DaysPill days={daysUntil(a[f.key])} />}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </section>

          <Policies type={type} id={id} policies={d.policies} canWrite={d.canWrite} onChange={load} />
          <Documents type={type} id={id} documents={d.documents} canWrite={d.canWrite} canManage={d.canManage} onChange={load} />
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={card}>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Insurance requests</h2>
            {d.requests.length === 0 ? (
              <Empty>None.</Empty>
            ) : (
              d.requests.map((r) => (
                <Link key={r.id} href={`/resources/requests/${r.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: `1px solid ${line}`, color: ink, fontSize: 14 }}>
                  <span>
                    <b>{r.ticket_number}</b> · {r.request_type === "add" ? "Add to coverage" : r.request_type === "remove" ? "Remove from coverage" : r.request_type}
                  </span>
                  <StatusPill status={r.status} />
                </Link>
              ))
            )}
          </section>
          <section style={card}>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>History</h2>
            {d.activity.length === 0 ? (
              <Empty>No history yet.</Empty>
            ) : (
              d.activity.map((x) => (
                <div key={x.id} style={{ padding: "6px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
                  <div style={{ color: ink }}>{x.summary}</div>
                  <div style={{ color: dim, fontSize: 12 }}>{new Date(x.at).toLocaleString()}</div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
      <style>{`@media (max-width: 860px) { .res-detail-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function RemoveBox({ type, id, singular, onDone, onCancel }: { type: string; id: string; singular: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState("");
  return (
    <section style={{ ...card, border: "1px solid #F5C2C0", marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 6px", color: "#B3261E" }}>Remove this {singular.toLowerCase()}</h2>
      <p style={{ fontSize: 14, color: dim, margin: "0 0 12px" }}>
        The record and its history are kept. A removal insurance request is created and everyone on the notification list is told.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="rm-on">
            Effective date
          </label>
          <input id="rm-on" type="date" style={input} value={on} onChange={(e) => setOn(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rm-reason">
            Reason *
          </label>
          <input id="rm-reason" style={input} placeholder="e.g. Sold, lease ended, no longer driving" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      {err && <p style={{ color: "#B3261E", fontSize: 14, fontWeight: 600 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          style={{ ...btn, background: "#B3261E" }}
          onClick={async () => {
            const r = await fetch(`/api/resources/${type}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", removed_on: on, removed_reason: reason }) });
            const j = await r.json();
            if (!r.ok) return setErr(j.error ?? "Couldn't remove.");
            onDone();
          }}
        >
          Remove
        </button>
        <button style={btnGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function Policies({ type, id, policies, canWrite, onChange }: { type: string; id: string; policies: any[]; canWrite: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const total = policies.reduce((s, p) => s + (Number(p.premium) || 0), 0);
  const field = (k: string, label: string, t = "text") => (
    <div>
      <label style={labelStyle} htmlFor={`p-${k}`}>
        {label}
      </label>
      <input id={`p-${k}`} type={t} step={t === "number" ? "0.01" : undefined} style={input} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );
  return (
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0, color: ink }}>Insurance coverage &amp; cost</h2>
        {canWrite && !open && (
          <button style={btnGhost} onClick={() => setOpen(true)}>
            + Add policy period
          </button>
        )}
      </div>
      {open && (
        <div style={{ background: "#F7FAF8", borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {field("provider", "Insurance provider *")}
            {field("policy_number", "Policy number")}
            {field("coverage_type", "Coverage type")}
            {field("coverage_start", "Coverage start", "date")}
            {field("coverage_end", "Coverage end", "date")}
            {field("renewal_date", "Renewal date", "date")}
            {field("premium", "Cost for this asset ($)", "number")}
          </div>
          {err && <p style={{ color: "#B3261E", fontSize: 14, fontWeight: 600 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={btn}
              onClick={async () => {
                const r = await fetch(`/api/resources/${type}/${id}/policies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
                const j = await r.json();
                if (!r.ok) return setErr(j.error ?? "Couldn't save.");
                setOpen(false);
                setV({});
                onChange();
              }}
            >
              Save policy
            </button>
            <button style={btnGhost} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {policies.length === 0 ? (
        <Empty>No policy periods recorded yet.</Empty>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: dim, fontSize: 12 }}>
                <th style={{ padding: "6px 8px" }}>Year</th>
                <th style={{ padding: "6px 8px" }}>Provider</th>
                <th style={{ padding: "6px 8px" }}>Coverage</th>
                <th style={{ padding: "6px 8px" }}>Renewal</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${line}` }}>
                  <td style={{ padding: "6px 8px" }}>{p.policy_year ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {p.provider}
                    {p.policy_number ? <span style={{ color: dim }}> · #{p.policy_number}</span> : null}
                    {p.coverage_type ? <div style={{ color: dim, fontSize: 12 }}>{p.coverage_type}</div> : null}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {fmtDate(p.coverage_start)} – {fmtDate(p.coverage_end)}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{fmtDate(p.renewal_date)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{money(p.premium)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `1px solid ${line}`, fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: "6px 8px" }}>
                  Total recorded cost
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Documents({ type, id, documents, canWrite, canManage, onChange }: { type: string; id: string; documents: any[]; canWrite: boolean; canManage: boolean; onChange: () => void }) {
  const [open, setOpen] = useState<null | { replaces?: any }>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0, color: ink }}>Documents</h2>
        {canWrite && !open && (
          <button style={btnGhost} onClick={() => setOpen({})}>
            + Upload
          </button>
        )}
      </div>
      {open && (
        <form
          style={{ background: "#F7FAF8", borderRadius: 12, padding: 14, marginBottom: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr("");
            const fd = new FormData(e.currentTarget);
            if (open.replaces) fd.set("replaces_id", open.replaces.id);
            const r = await fetch(`/api/resources/${type}/${id}/documents`, { method: "POST", body: fd });
            const j = await r.json();
            setBusy(false);
            if (!r.ok) return setErr(j.error ?? "Upload failed.");
            setOpen(null);
            onChange();
          }}
        >
          {open.replaces && (
            <p style={{ fontSize: 13, margin: "0 0 10px" }}>
              Uploading a new version of <b>{open.replaces.title}</b> (currently version {open.replaces.version}).
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="d-type">
                Type *
              </label>
              <select id="d-type" name="doc_type" style={input} defaultValue={open.replaces?.doc_type ?? ""} required>
                <option value="">Choose…</option>
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="d-title">
                Title
              </label>
              <input id="d-title" name="title" style={input} defaultValue={open.replaces?.title ?? ""} placeholder="Defaults to the file name" />
            </div>
            <div>
              <label style={labelStyle} htmlFor="d-exp">
                Expires on
              </label>
              <input id="d-exp" name="expires_on" type="date" style={input} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle} htmlFor="d-file">
                File * (PDF, image, Word or Excel, up to 25 MB)
              </label>
              <input id="d-file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx" />
            </div>
          </div>
          {err && <p style={{ color: "#B3261E", fontSize: 14, fontWeight: 600 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
              {busy ? "Uploading…" : "Upload"}
            </button>
            <button type="button" style={btnGhost} onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {documents.length === 0 ? (
        <Empty>No documents yet.</Empty>
      ) : (
        documents.map((doc) => (
          <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 14 }}>
            <div>
              <a href={`/api/resources/documents/${doc.id}`} style={{ fontWeight: 600, color: ink }}>
                {doc.title}
              </a>
              <div style={{ fontSize: 12, color: dim }}>
                {DOC_TYPES.find((t) => t.value === doc.doc_type)?.label} · v{doc.version} · uploaded {fmtDate(doc.uploaded_at)}
                {doc.expires_on ? ` · expires ${fmtDate(doc.expires_on)}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {doc.expires_on && daysUntil(doc.expires_on) <= 90 && <DaysPill days={daysUntil(doc.expires_on)} />}
              {canWrite && (
                <button style={{ ...btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => setOpen({ replaces: doc })}>
                  New version
                </button>
              )}
              {canManage && (
                <button
                  style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: "#B3261E" }}
                  onClick={async () => {
                    if (!confirm(`Delete "${doc.title}"? It will be hidden; the audit log is kept.`)) return;
                    await fetch(`/api/resources/documents/${doc.id}`, { method: "DELETE" });
                    onChange();
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
