"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Eyebrow, PageTitle, PillButton, inputStyle, dim, faint, ink, emerald, rose } from "@/components/speaker/ui";
import RequestCard, { type ListRow } from "@/components/speaker/RequestCard";

type Approver = { id: string; full_name: string; email: string; role_label: string | null };
type Rd = { first_name: string | null; last_name: string | null; email: string; assigned_region: string | null };

export default function AdminSpeakerRequestsPage() {
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [rds, setRds] = useState<Rd[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [all, setAll] = useState<ListRow[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ full_name: "", email: "", role_label: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/speaker-leadership-approvers");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    const body = await res.json();
    setApprovers(body.approvers ?? []);
    setRds(body.regionalDirectors ?? []);
    setCanEdit(!!body.canEdit);
  }
  useEffect(() => {
    load();
    fetch("/api/speaker-requests?scope=all")
      .then((r) => r.json())
      .then((d) => setAll(d.all ?? []));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/speaker-leadership-approvers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setForm({ full_name: "", email: "", role_label: "" });
    load();
  }
  async function remove(email: string) {
    await fetch("/api/admin/speaker-leadership-approvers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, remove: true }) });
    load();
  }

  if (forbidden) return <p className="text-sm" style={{ color: dim }}>You don&apos;t have access to Speaker Requests admin.</p>;

  const list = (all ?? []).filter((r) => filter === "all" || (filter === "pending" ? r.status.startsWith("pending") : filter === "paperwork" ? r.status === "approved" && (!r.agreement_signed_at || (r.w9_needed && !r.w9_received_at)) : r.status === filter));

  return (
    <div>
      <PageTitle eyebrow="Admin · Finance" title="Speaker Requests" right={<PillButton href="/speaker-requests/new">+ New request</PillButton>} />

      <div className="grid xl:grid-cols-[1fr_380px] gap-6 items-start">
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              ["all", "All"],
              ["pending", "Pending approval"],
              ["paperwork", "Waiting on speaker"],
              ["approved", "Approved"],
              ["denied", "Denied"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className="text-xs font-bold rounded-full px-3.5 py-1.5"
                style={{ background: filter === k ? emerald : "#fff", color: filter === k ? "#fff" : dim, border: "1px solid var(--portal-line)" }}
              >
                {label}
              </button>
            ))}
          </div>
          {!all && <p className="text-sm" style={{ color: faint }}>Loading…</p>}
          {all && list.length === 0 && (
            <Card>
              <p className="text-sm m-0" style={{ color: dim }}>
                Nothing here.
              </p>
            </Card>
          )}
          <div className="grid gap-3">
            {list.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        </div>

        <Card>
          <Eyebrow>Gate 2 · Joint leadership approvers</Eyebrow>
          <p className="text-xs mt-1 mb-4" style={{ color: dim }}>
            Used only when travel is required <strong>and</strong> fee + travel + hotel is over $500. Everyone listed must approve. The request&apos;s Regional Director is added automatically when one is assigned in the portal.
          </p>
          {approvers.length === 0 && (
            <p className="text-xs rounded-xl p-3 mb-3 font-semibold" style={{ background: `${rose}10`, color: rose }}>
              No leadership approvers yet. Requests that need Gate 2 will be stuck until you add at least one (e.g. COO, Finance Desk, Executive Director).
            </p>
          )}
          <ul className="space-y-2 mb-4">
            {approvers.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5" style={{ background: "#F4F3EE" }}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: ink }}>
                    {a.full_name} {a.role_label && <span className="text-xs font-normal" style={{ color: dim }}>· {a.role_label}</span>}
                  </div>
                  <div className="text-xs truncate" style={{ color: faint }}>
                    {a.email}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={() => remove(a.email)} className="text-xs font-bold" style={{ color: rose }}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <form onSubmit={add} className="space-y-2">
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" style={inputStyle} />
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@icnarelief.org" style={inputStyle} />
              <input value={form.role_label} onChange={(e) => setForm({ ...form, role_label: e.target.value })} placeholder="Role (e.g. COO, Finance Desk)" style={inputStyle} />
              <PillButton type="submit">Add approver</PillButton>
              {error && (
                <p className="text-xs" style={{ color: rose }}>
                  {error}
                </p>
              )}
            </form>
          )}

          <div className="mt-6 pt-4" style={{ borderTop: "1px dashed var(--portal-line)" }}>
            <div className="text-xs font-bold mb-2" style={{ color: dim }}>
              Regional Directors in the portal (auto-added by region)
            </div>
            {rds.length === 0 ? (
              <p className="text-xs" style={{ color: faint }}>
                None assigned yet — RDs get added automatically once they have the regional_director role and a region in{" "}
                <Link href="/admin/employees" style={{ color: emerald }}>
                  Employees
                </Link>
                .
              </p>
            ) : (
              rds.map((r) => (
                <div key={r.email} className="text-xs py-1" style={{ color: ink }}>
                  {`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()} <span style={{ color: faint }}>· {r.assigned_region ?? "no region"}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
