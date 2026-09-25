"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ASSETS, DOC_TYPES, REQUEST_STATUSES, statusLabel, type AssetType } from "@/lib/resources/schema";
import { btn, card, dim, Empty, fmtDate, H1, ink, input, labelStyle, line, StatusPill } from "../../ui";

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/resources/requests/${id}`)
      .then((r) => r.json())
      .then((j) => {
        setD(j);
        const r = j.request;
        setForm({
          status: r.status,
          carrier_name: r.carrier_name ?? "",
          carrier_reference: r.carrier_reference ?? "",
          requested_effective_date: r.requested_effective_date ?? "",
          owner_employee_id: r.owner_employee_id ?? "",
          notes: r.notes ?? "",
          comment: "",
        });
      });
  }, [id]);
  useEffect(load, [load]);

  if (!d) return <Empty>Loading…</Empty>;
  if (d.error) return <Empty>{d.error}</Empty>;
  const r = d.request;
  const t = r.asset.type as AssetType;
  const cfg = t ? ASSETS[t] : null;
  const allowed = d.canManage ? REQUEST_STATUSES : REQUEST_STATUSES.filter((s) => s.value === "draft" || s.value === "submitted" || s.value === r.status);
  const editable = d.canWrite || d.canManage;
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <Link href="/resources/requests" style={{ fontSize: 13, color: dim }}>
        ← Insurance requests
      </Link>
      <H1 right={<StatusPill status={r.status} />}>
        {r.ticket_number}: {r.request_type === "remove" ? "Remove from coverage" : "Add to coverage"}
      </H1>
      <p style={{ margin: "-8px 0 16px", fontSize: 14, color: dim }}>
        {r.office_name} ·{" "}
        {t ? (
          <Link href={`/resources/${t}/${r.asset.id}`} style={{ color: ink, fontWeight: 600 }}>
            {r.asset.title}
          </Link>
        ) : (
          r.asset.title
        )}
        {r.owner_name ? ` · owner: ${r.owner_name}` : ""}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16, alignItems: "start" }} className="res-detail-grid">
        <div style={{ display: "grid", gap: 16 }}>
          {editable && (
            <section style={card}>
              <h2 style={{ fontSize: 16, margin: "0 0 12px", color: ink }}>Update this request</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle} htmlFor="q-status">
                    Status
                  </label>
                  <select id="q-status" style={input} value={form.status} onChange={(e) => set("status", e.target.value)}>
                    {allowed.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {!d.canManage && <p style={{ fontSize: 12, color: dim, margin: "4px 0 0" }}>After you submit, the insurance team (Admin / IT) takes it from there.</p>}
                </div>
                <div>
                  <label style={labelStyle} htmlFor="q-eff">
                    Effective date requested
                  </label>
                  <input id="q-eff" type="date" style={input} value={form.requested_effective_date} onChange={(e) => set("requested_effective_date", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="q-carrier">
                    Insurance company
                  </label>
                  <input id="q-carrier" style={input} value={form.carrier_name} onChange={(e) => set("carrier_name", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="q-ref">
                    Insurance company reference #
                  </label>
                  <input id="q-ref" style={input} value={form.carrier_reference} onChange={(e) => set("carrier_reference", e.target.value)} />
                </div>
                {d.canManage && (
                  <div>
                    <label style={labelStyle} htmlFor="q-owner">
                      Assigned internal owner
                    </label>
                    <select id="q-owner" style={input} value={form.owner_employee_id} onChange={(e) => set("owner_employee_id", e.target.value)}>
                      <option value="">Unassigned</option>
                      {d.staff.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle} htmlFor="q-comment">
                    Add a note to the timeline
                  </label>
                  <textarea id="q-comment" rows={2} style={input} value={form.comment} onChange={(e) => set("comment", e.target.value)} placeholder="e.g. Sent VIN and driver list to carrier; waiting on quote" />
                </div>
              </div>
              {msg && <p style={{ color: msg.ok ? "#15803D" : "#B3261E", fontSize: 14, fontWeight: 600 }}>{msg.text}</p>}
              <button
                style={{ ...btn, marginTop: 12, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg(null);
                  const res = await fetch(`/api/resources/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
                  const j = await res.json();
                  setBusy(false);
                  if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Couldn't save." });
                  setMsg({ ok: true, text: "Saved." });
                  load();
                }}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </section>
          )}

          {cfg && r.asset_row && (
            <section style={card}>
              <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Details for the insurance company</h2>
              <p style={{ fontSize: 13, color: dim, margin: "0 0 10px" }}>Prefilled from the {cfg.singular.toLowerCase()} record, so nothing needs re-typing.</p>
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px 16px", margin: 0 }}>
                <div>
                  <dt style={{ fontSize: 12, color: dim }}>Office</dt>
                  <dd style={{ margin: 0, fontSize: 14 }}>{r.office_name}</dd>
                </div>
                {cfg.fields
                  .filter((f) => f.kind !== "textarea" && f.kind !== "driver" && r.asset_row[f.key] != null && r.asset_row[f.key] !== "")
                  .map((f) => (
                    <div key={f.key}>
                      <dt style={{ fontSize: 12, color: dim }}>{f.label}</dt>
                      <dd style={{ margin: 0, fontSize: 14 }}>
                        {f.kind === "date" ? fmtDate(r.asset_row[f.key]) : f.kind === "select" ? f.options?.find((o) => o.value === r.asset_row[f.key])?.label : String(r.asset_row[f.key])}
                      </dd>
                    </div>
                  ))}
              </dl>
              <button
                style={{ ...btn, background: "#fff", color: ink, border: `1px solid ${line}`, marginTop: 12 }}
                onClick={() => {
                  const lines = [
                    `${r.request_type === "remove" ? "Please REMOVE from coverage" : "Please ADD to coverage"} (ICNA Relief ref ${r.ticket_number})`,
                    `Effective date: ${r.requested_effective_date ?? ""}`,
                    `Office: ${r.office_name}`,
                    ...cfg.fields.filter((f) => f.kind !== "textarea" && f.kind !== "driver" && r.asset_row[f.key]).map((f) => `${f.label}: ${r.asset_row[f.key]}`),
                  ];
                  navigator.clipboard.writeText(lines.join("\n"));
                  setMsg({ ok: true, text: "Copied. Paste it into your email to the insurance company." });
                }}
              >
                Copy details for the carrier
              </button>
            </section>
          )}

          <section style={card}>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Supporting documents</h2>
            {d.documents.length === 0 ? (
              <Empty>None yet. Upload them on the {cfg?.singular.toLowerCase() ?? "asset"} page.</Empty>
            ) : (
              d.documents.map((doc: any) => (
                <div key={doc.id} style={{ padding: "6px 0", borderTop: `1px solid ${line}`, fontSize: 14 }}>
                  <a href={`/api/resources/documents/${doc.id}`} style={{ fontWeight: 600, color: ink }}>
                    {doc.title}
                  </a>
                  <span style={{ color: dim, fontSize: 12 }}> · {DOC_TYPES.find((x) => x.value === doc.doc_type)?.label} · v{doc.version}</span>
                </div>
              ))
            )}
          </section>
        </div>

        <section style={card}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Timeline</h2>
          <dl style={{ fontSize: 13, margin: "0 0 12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
            <dt style={{ color: dim }}>Submitted</dt>
            <dd style={{ margin: 0 }}>{fmtDate(r.submitted_at)}</dd>
            <dt style={{ color: dim }}>Sent to carrier</dt>
            <dd style={{ margin: 0 }}>{fmtDate(r.sent_at)}</dd>
            <dt style={{ color: dim }}>Response</dt>
            <dd style={{ margin: 0 }}>{fmtDate(r.responded_at)}</dd>
            <dt style={{ color: dim }}>Coverage confirmed</dt>
            <dd style={{ margin: 0 }}>{fmtDate(r.bound_at)}</dd>
          </dl>
          {d.events.map((e: any) => (
            <div key={e.id} style={{ padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
              <div style={{ color: ink }}>
                {e.kind === "status" ? (
                  <>
                    Status: {statusLabel(e.from_status)} → <b>{statusLabel(e.to_status)}</b>
                  </>
                ) : (
                  e.body
                )}
              </div>
              <div style={{ color: dim, fontSize: 12 }}>
                {e.actor_name} · {new Date(e.at).toLocaleString()}
              </div>
            </div>
          ))}
        </section>
      </div>
      <style>{`@media (max-width: 860px) { .res-detail-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
