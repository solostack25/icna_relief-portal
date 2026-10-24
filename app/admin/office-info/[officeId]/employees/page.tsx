"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Eyebrow, PageTitle, PillButton, inputStyle, dim, faint, ink, emerald, gold, rose } from "@/components/speaker/ui";

type Person = {
  key: string;
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean | null;
  counts: { tickets: number; devices: number; keys: number };
};
type Key = { id: string; label: string; key_code: string | null; notes: string | null; status: string; holder: { holder_name: string | null; holder_email: string; assigned_at: string } | null };
type Hire = { id: string; full_name: string; job_title: string | null; start_date: string | null; created_at: string; ticket: { ticket_number: string | null; overall_status: string } | null };
type Data = {
  office: { id: string; name: string; entra_office_names: string[] };
  canEditMapping: boolean;
  warning: string | null;
  people: Person[];
  keys: Key[];
  newHires: Hire[];
  needsOptions: string[];
};

const day = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

function Badge({ n, label }: { n: number; label: string }) {
  if (!n) return null;
  return (
    <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ color: emerald, background: `${emerald}12` }}>
      {n} {label}
      {n === 1 ? "" : "s"}
    </span>
  );
}

export default function OfficeEmployeesPage() {
  const { officeId } = useParams<{ officeId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showHire, setShowHire] = useState(false);
  const [hire, setHire] = useState({ full_name: "", job_title: "", start_date: "", employment_type: "Full-time", personal_email: "", phone: "", supervisor: "", notes: "", needs: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState({ label: "", key_code: "" });
  const [mapping, setMapping] = useState("");

  async function load() {
    const res = await fetch(`/api/office-employees/${officeId}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't load.");
      return;
    }
    setData(body);
    setMapping((body.office.entra_office_names ?? []).join(", "));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  async function post(payload: Record<string, unknown>, ok?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/office-employees/${officeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return null;
    }
    if (ok) setNotice(ok);
    await load();
    return body;
  }

  const people = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => !s || [p.name, p.email, p.jobTitle, p.department].some((v) => (v ?? "").toLowerCase().includes(s)));
  }, [data, q]);

  async function submitHire(e: React.FormEvent) {
    e.preventDefault();
    const r = await post({ action: "new_hire", hire });
    if (r) {
      setNotice(`Sent to HR as ${r.ticket?.ticket_number ?? "a ticket"}. HR handles the official onboarding from there.`);
      setShowHire(false);
      setHire({ full_name: "", job_title: "", start_date: "", employment_type: "Full-time", personal_email: "", phone: "", supervisor: "", notes: "", needs: [] });
    }
  }

  return (
    <div className="max-w-5xl">
      <Link href={`/admin/office-info/${officeId}`} className="text-xs" style={{ color: faint }}>
        ← Office dashboard
      </Link>
      <PageTitle
        eyebrow="Office"
        title={data ? `${data.office.name} employees` : "Employees"}
        right={
          <PillButton onClick={() => setShowHire((v) => !v)}>{showHire ? "Close" : "+ New employee"}</PillButton>
        }
      />

      {error && (
        <div className="text-sm rounded-xl p-3 mb-3 font-semibold" style={{ background: `${rose}12`, color: rose }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="text-sm rounded-xl p-3 mb-3 font-semibold" style={{ background: `${emerald}12`, color: emerald }}>
          {notice}
        </div>
      )}
      {data?.warning && (
        <div className="text-sm rounded-xl p-3 mb-3" style={{ background: `${gold}14`, color: "#7a5a1c" }}>
          {data.warning}
        </div>
      )}

      {showHire && data && (
        <Card className="mb-4">
          <Eyebrow>Request a new employee</Eyebrow>
          <p className="text-sm mt-0 mb-4" style={{ color: dim }}>
            This sends HR a ticket to officially onboard them. It doesn&apos;t create any accounts by itself.
          </p>
          <form onSubmit={submitHire} className="grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm font-semibold" style={{ color: ink }}>
                Full name *
                <input value={hire.full_name} onChange={(e) => setHire({ ...hire, full_name: e.target.value })} style={inputStyle} required />
              </label>
              <label className="text-sm font-semibold" style={{ color: ink }}>
                Job title
                <input value={hire.job_title} onChange={(e) => setHire({ ...hire, job_title: e.target.value })} style={inputStyle} />
              </label>
              <label className="text-sm font-semibold" style={{ color: ink }}>
                Start date
                <input type="date" value={hire.start_date} onChange={(e) => setHire({ ...hire, start_date: e.target.value })} style={inputStyle} />
              </label>
              <label className="text-sm font-semibold" style={{ color: ink }}>
                Employment
                <select value={hire.employment_type} onChange={(e) => setHire({ ...hire, employment_type: e.target.value })} style={inputStyle}>
                  {["Full-time", "Part-time", "Temporary", "Contractor", "Intern"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold" style={{ color: ink }}>
                Personal email (for HR to reach them)
                <input type="email" value={hire.personal_email} onChange={(e) => setHire({ ...hire, personal_email: e.target.value })} style={inputStyle} />
              </label>
              <label className="text-sm font-semibold" style={{ color: ink }}>
                Phone
                <input value={hire.phone} onChange={(e) => setHire({ ...hire, phone: e.target.value })} style={inputStyle} />
              </label>
              <label className="text-sm font-semibold sm:col-span-2" style={{ color: ink }}>
                Supervisor
                <input value={hire.supervisor} onChange={(e) => setHire({ ...hire, supervisor: e.target.value })} placeholder="Leave blank if it's you" style={inputStyle} />
              </label>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1.5" style={{ color: ink }}>
                They&apos;ll need
              </div>
              <div className="flex flex-wrap gap-2">
                {data.needsOptions.map((n) => {
                  const on = hire.needs.includes(n);
                  return (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setHire({ ...hire, needs: on ? hire.needs.filter((x) => x !== n) : [...hire.needs, n] })}
                      className="rounded-full px-3 py-1.5 text-xs font-bold"
                      style={on ? { background: emerald, color: "#fff" } : { background: "#fff", color: ink, border: "1.5px solid var(--portal-line)" }}
                    >
                      {on ? "✓ " : ""}
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="text-sm font-semibold" style={{ color: ink }}>
              Notes for HR
              <textarea value={hire.notes} onChange={(e) => setHire({ ...hire, notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </label>
            <div>
              <PillButton type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send to HR"}
              </PillButton>
            </div>
          </form>
        </Card>
      )}

      {data && data.newHires.length > 0 && (
        <Card className="mb-4">
          <Eyebrow>New employee requests</Eyebrow>
          {data.newHires.map((h) => (
            <div key={h.id} className="flex justify-between gap-3 text-sm py-1.5" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
              <span style={{ color: ink }}>
                <strong>{h.full_name}</strong>
                {h.job_title ? <span style={{ color: dim }}> · {h.job_title}</span> : null}
                <span style={{ color: dim }}> · starts {day(h.start_date)}</span>
              </span>
              <span className="text-xs" style={{ color: h.ticket?.overall_status === "closed" ? emerald : gold }}>
                {h.ticket?.ticket_number ?? "HR ticket"} · {h.ticket?.overall_status === "closed" ? "done" : "with HR"}
              </span>
            </div>
          ))}
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <Eyebrow>{data ? `${data.people.length} ${data.people.length === 1 ? "person" : "people"}` : "People"}</Eyebrow>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, title" style={{ ...inputStyle, maxWidth: 280, padding: "8px 12px" }} />
        </div>
        {!data ? (
          <p className="text-sm m-0" style={{ color: faint }}>
            Loading…
          </p>
        ) : people.length === 0 ? (
          <p className="text-sm m-0" style={{ color: dim }}>
            {data.people.length ? "No one matches that search." : "No one found for this office yet. If people's Microsoft 365 Office field uses a different name, an admin can map it below."}
          </p>
        ) : (
          <div className="grid">
            {people.map((p) => (
              <Link
                key={p.key}
                href={`/admin/office-info/${officeId}/employees/${encodeURIComponent(p.key)}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-black/[0.02] rounded-lg px-2 -mx-2"
                style={{ borderBottom: "1px solid var(--portal-line)" }}
              >
                <span className="min-w-0">
                  <span className="font-semibold" style={{ color: ink }}>
                    {p.name}
                  </span>
                  {p.accountEnabled === false && (
                    <span className="ml-2 text-[11px] font-bold rounded-full px-2 py-0.5" style={{ color: rose, background: `${rose}12` }}>
                      Sign-in disabled
                    </span>
                  )}
                  <span className="block text-xs" style={{ color: dim }}>
                    {[p.jobTitle, p.email].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <Badge n={p.counts.tickets} label="open ticket" />
                  <Badge n={p.counts.devices} label="device" />
                  <Badge n={p.counts.keys} label="key" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {data && (
        <Card className="mb-4">
          <Eyebrow>Office keys</Eyebrow>
          <p className="text-xs mt-0 mb-3" style={{ color: dim }}>
            Keep a list of this office&apos;s keys here, then assign and return them from each person&apos;s profile.
          </p>
          {data.keys.length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>
              No keys added yet.
            </p>
          ) : (
            <div className="grid mb-3">
              {data.keys.map((k) => (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
                  <span style={{ color: ink, opacity: k.status === "active" ? 1 : 0.55 }}>
                    🔑 <strong>{k.label}</strong>
                    {k.key_code ? <span style={{ color: dim }}> #{k.key_code}</span> : null}
                    {k.status !== "active" && <span style={{ color: rose }}> · {k.status}</span>}
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    <span style={{ color: k.holder ? ink : dim }}>{k.holder ? `With ${k.holder.holder_name ?? k.holder.holder_email}` : k.status === "active" ? "Available" : ""}</span>
                    {k.status === "active" ? (
                      <>
                        <button className="font-semibold underline" style={{ color: dim }} onClick={() => confirm(`Mark ${k.label} as lost?`) && post({ action: "key_status", keyId: k.id, status: "lost" })}>
                          Lost
                        </button>
                        <button className="font-semibold underline" style={{ color: dim }} onClick={() => confirm(`Retire ${k.label}?`) && post({ action: "key_status", keyId: k.id, status: "retired" })}>
                          Retire
                        </button>
                      </>
                    ) : (
                      <button className="font-semibold underline" style={{ color: emerald }} onClick={() => post({ action: "key_status", keyId: k.id, status: "active" })}>
                        Restore
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <form
            className="flex flex-wrap gap-2 items-center"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await post({ action: "add_key", ...newKey }, `Added ${newKey.label}.`)) setNewKey({ label: "", key_code: "" });
            }}
          >
            <input value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} placeholder="Key name, e.g. Front door" style={{ ...inputStyle, maxWidth: 220, padding: "8px 12px" }} />
            <input value={newKey.key_code} onChange={(e) => setNewKey({ ...newKey, key_code: e.target.value })} placeholder="Number on key (optional)" style={{ ...inputStyle, maxWidth: 200, padding: "8px 12px" }} />
            <PillButton type="submit" variant="ghost" disabled={busy || !newKey.label.trim()}>
              Add key
            </PillButton>
          </form>
        </Card>
      )}

      {data?.canEditMapping && (
        <Card>
          <details>
            <summary className="text-sm font-semibold cursor-pointer" style={{ color: ink }}>
              Admin: Microsoft 365 office names for {data.office.name}
            </summary>
            <p className="text-xs mt-2 mb-2" style={{ color: dim }}>
              People are listed here when their Microsoft 365 &quot;Office&quot; field matches one of these names (comma-separated). Leave it empty to match
              &quot;{data.office.name}&quot;.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input value={mapping} onChange={(e) => setMapping(e.target.value)} placeholder={data.office.name} style={{ ...inputStyle, maxWidth: 420, padding: "8px 12px" }} />
              <PillButton variant="ghost" disabled={busy} onClick={() => post({ action: "set_office_names", names: mapping }, "Saved. The list now uses those names.")}>
                Save
              </PillButton>
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
