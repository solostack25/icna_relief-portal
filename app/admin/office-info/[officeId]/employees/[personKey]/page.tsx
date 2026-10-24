"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Eyebrow, PageTitle, PillButton, inputStyle, dim, faint, ink, emerald, gold, rose } from "@/components/speaker/ui";

type Data = {
  office: { id: string; name: string };
  person: {
    key: string;
    name: string;
    email: string;
    jobTitle: string | null;
    department: string | null;
    accountEnabled: boolean | null;
    phone: string | null;
    managerName: string | null;
    managerEmail: string | null;
  };
  assets: {
    tickets: { id: string; ticket_number: string | null; title: string; created_at: string; department: string | null; status: string | null }[];
    devices: { key: string; model: string }[];
    vehicles: { label: string }[];
    driver: { status: string } | null;
    pex: { count: number };
    keys: { assignmentId: string; label: string; code: string | null; assignedAt: string }[];
  };
  offboarding: {
    status: string;
    created_at: string;
    last_day: string | null;
    notes: string | null;
    signin_disabled_at: string | null;
    signin_error: string | null;
    requested_by_name: string | null;
    hr_ticket: { ticket_number: string | null; overall_status: string } | null;
    it_ticket: { ticket_number: string | null; overall_status: string } | null;
  } | null;
  availableKeys: { id: string; label: string; key_code: string | null }[];
  isSelf: boolean;
};

const DEPT: Record<string, string> = { it: "IT", hr: "HR", marketing: "Marketing", finance: "Finance" };
const STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", on_hold: "On hold", quality_assurance: "QA" };
const day = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card>
      <Eyebrow>
        {title}
        {count !== undefined ? ` · ${count}` : ""}
      </Eyebrow>
      {children}
    </Card>
  );
}
const Empty = ({ text }: { text: string }) => (
  <p className="text-sm m-0" style={{ color: faint }}>
    {text}
  </p>
);

export default function EmployeeProfilePage() {
  const { officeId, personKey } = useParams<{ officeId: string; personKey: string }>();
  const key = decodeURIComponent(personKey);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyPick, setKeyPick] = useState("");
  const [newKey, setNewKey] = useState({ label: "", key_code: "" });
  const [offOpen, setOffOpen] = useState(false);
  const [off, setOff] = useState({ lastDay: "", notes: "", confirmName: "" });

  async function load() {
    const res = await fetch(`/api/office-employees/${officeId}?person=${encodeURIComponent(key)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't load.");
      return;
    }
    setData(body);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId, key]);

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

  async function offboard() {
    const r = await post({ action: "offboard", person: key, ...off });
    if (r) {
      setOffOpen(false);
      setNotice(
        `Offboarding started. HR ticket ${r.hrTicket?.ticket_number ?? ""} and IT ticket ${r.itTicket?.ticket_number ?? ""} were opened.${
          r.signinDisabled ? " Their Microsoft 365 sign-in is disabled." : r.signinError ? ` ${r.signinError} IT has been told on their ticket.` : ""
        }`
      );
    }
  }

  const p = data?.person;
  const a = data?.assets;
  const assetCount = a ? a.devices.length + a.keys.length + a.vehicles.length + (a.pex.count ? 1 : 0) + (a.driver && !a.vehicles.length ? 1 : 0) : 0;

  return (
    <div className="max-w-4xl">
      <Link href={`/admin/office-info/${officeId}/employees`} className="text-xs" style={{ color: faint }}>
        ← {data?.office.name ?? "Office"} employees
      </Link>

      {error && !data && (
        <Card className="mt-4">
          <p className="text-sm m-0" style={{ color: rose }}>
            {error}
          </p>
        </Card>
      )}
      {!data && !error && (
        <p className="text-sm mt-4" style={{ color: faint }}>
          Loading…
        </p>
      )}

      {data && p && a && (
        <>
          <PageTitle eyebrow="Employee" title={p.name} />
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

          <Card className="mb-4">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span style={{ color: faint }}>Email </span>
                <a href={`mailto:${p.email}`} style={{ color: emerald, fontWeight: 600 }}>
                  {p.email}
                </a>
              </div>
              <div>
                <span style={{ color: faint }}>Title </span>
                <span style={{ color: ink }}>{p.jobTitle ?? "—"}</span>
              </div>
              <div>
                <span style={{ color: faint }}>Phone </span>
                <span style={{ color: ink }}>{p.phone ?? "—"}</span>
              </div>
              <div>
                <span style={{ color: faint }}>Reports to </span>
                <span style={{ color: ink }}>{p.managerName ?? "—"}</span>
              </div>
              {p.department && (
                <div>
                  <span style={{ color: faint }}>Department </span>
                  <span style={{ color: ink }}>{p.department}</span>
                </div>
              )}
              <div>
                <span style={{ color: faint }}>Sign-in </span>
                <span style={{ color: p.accountEnabled === false ? rose : emerald, fontWeight: 700 }}>{p.accountEnabled === false ? "Disabled" : "Active"}</span>
              </div>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Section title="Devices" count={a.devices.length}>
              {a.devices.length ? (
                a.devices.map((d) => (
                  <div key={d.key} className="text-sm py-1" style={{ color: ink }}>
                    💻 {d.model}
                  </div>
                ))
              ) : (
                <Empty text="No company devices assigned in Intune." />
              )}
            </Section>

            <Section title="Office keys" count={a.keys.length}>
              {a.keys.map((k) => (
                <div key={k.assignmentId} className="flex justify-between gap-2 text-sm py-1">
                  <span style={{ color: ink }}>
                    🔑 {k.label}
                    {k.code ? <span style={{ color: dim }}> #{k.code}</span> : null}
                    <span className="text-xs" style={{ color: faint }}>
                      {" "}
                      · since {day(k.assignedAt)}
                    </span>
                  </span>
                  <button className="text-xs font-semibold underline" style={{ color: emerald }} disabled={busy} onClick={() => post({ action: "return_key", assignmentId: k.assignmentId }, `${k.label} marked returned.`)}>
                    Returned
                  </button>
                </div>
              ))}
              {!a.keys.length && <Empty text="No keys assigned." />}
              {p.accountEnabled !== false && (
                <div className="mt-3 pt-3 grid gap-2" style={{ borderTop: "1px dashed var(--portal-line)" }}>
                  <div className="flex gap-2 flex-wrap">
                    <select value={keyPick} onChange={(e) => setKeyPick(e.target.value)} style={{ ...inputStyle, maxWidth: 230, padding: "7px 10px" }}>
                      <option value="">Assign a key…</option>
                      {data.availableKeys.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                          {k.key_code ? ` #${k.key_code}` : ""}
                        </option>
                      ))}
                      <option value="__new">+ A key that isn&apos;t listed yet</option>
                    </select>
                    {keyPick && keyPick !== "__new" && (
                      <PillButton disabled={busy} onClick={async () => (await post({ action: "assign_key", person: key, keyId: keyPick }, "Key assigned.")) && setKeyPick("")}>
                        Assign
                      </PillButton>
                    )}
                  </div>
                  {keyPick === "__new" && (
                    <div className="flex gap-2 flex-wrap">
                      <input value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} placeholder="Key name, e.g. Front door" style={{ ...inputStyle, maxWidth: 200, padding: "7px 10px" }} />
                      <input value={newKey.key_code} onChange={(e) => setNewKey({ ...newKey, key_code: e.target.value })} placeholder="Number (optional)" style={{ ...inputStyle, maxWidth: 140, padding: "7px 10px" }} />
                      <PillButton
                        disabled={busy || !newKey.label.trim()}
                        onClick={async () => {
                          if (await post({ action: "assign_key", person: key, newKey }, `${newKey.label} added and assigned.`)) {
                            setKeyPick("");
                            setNewKey({ label: "", key_code: "" });
                          }
                        }}
                      >
                        Add &amp; assign
                      </PillButton>
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Vehicles">
              {a.vehicles.map((v, i) => (
                <div key={i} className="text-sm py-1" style={{ color: ink }}>
                  🚐 {v.label} <span className="text-xs" style={{ color: dim }}>· primary driver</span>
                </div>
              ))}
              {!a.vehicles.length && (a.driver ? <Empty text="Approved driver, not the primary driver on a vehicle." /> : <Empty text="Not an approved driver." />)}
            </Section>

            <Section title="PEX card">
              {a.pex.count ? (
                <div className="text-sm" style={{ color: ink }}>
                  💳 Has {a.pex.count > 1 ? `${a.pex.count} PEX cards` : "a PEX card"}
                </div>
              ) : (
                <Empty text="No PEX card." />
              )}
            </Section>
          </div>

          <Section title="Open tickets" count={a.tickets.length}>
            {a.tickets.length ? (
              a.tickets.map((t) => (
                <div key={t.id} className="flex justify-between gap-3 text-sm py-1.5" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
                  <span style={{ color: ink }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: dim, fontSize: 12 }}>{t.ticket_number}</span> {t.title}
                  </span>
                  <span className="text-xs whitespace-nowrap" style={{ color: dim }}>
                    {t.department ? `${DEPT[t.department] ?? t.department} · ` : ""}
                    {t.status ? STATUS[t.status] ?? t.status : ""} · {day(t.created_at)}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No open Help Desk tickets." />
            )}
          </Section>

          {/* ---------- Offboarding ---------- */}
          <div className="mt-6">
            {data.offboarding ? (
              <Card style={{ borderColor: `${rose}44` }}>
                <Eyebrow color={data.offboarding.status === "completed" ? emerald : rose}>
                  {data.offboarding.status === "completed" ? "Offboarded" : data.offboarding.status === "started" ? "Offboarding — starting" : "Offboarding in progress"}
                </Eyebrow>
                <p className="text-sm mt-0 mb-2" style={{ color: ink }}>
                  Started {day(data.offboarding.created_at)}
                  {data.offboarding.requested_by_name ? ` by ${data.offboarding.requested_by_name}` : ""} · last day {day(data.offboarding.last_day)}
                </p>
                <div className="text-sm grid gap-1" style={{ color: ink }}>
                  <div>
                    HR ticket <strong>{data.offboarding.hr_ticket?.ticket_number ?? "—"}</strong>{" "}
                    <span style={{ color: data.offboarding.hr_ticket?.overall_status === "closed" ? emerald : gold }}>· {data.offboarding.hr_ticket?.overall_status === "closed" ? "done" : "open"}</span>
                  </div>
                  <div>
                    IT ticket <strong>{data.offboarding.it_ticket?.ticket_number ?? "—"}</strong>{" "}
                    <span style={{ color: data.offboarding.it_ticket?.overall_status === "closed" ? emerald : gold }}>· {data.offboarding.it_ticket?.overall_status === "closed" ? "done" : "open"}</span>
                  </div>
                  <div style={{ color: data.offboarding.signin_disabled_at ? emerald : rose }}>
                    {data.offboarding.signin_disabled_at ? `Microsoft 365 sign-in disabled ${new Date(data.offboarding.signin_disabled_at).toLocaleString()}` : "Microsoft 365 sign-in not disabled — IT will handle it on their ticket"}
                  </div>
                  {data.offboarding.signin_error ? <div style={{ color: gold }}>⚠ {data.offboarding.signin_error}</div> : null}
                </div>
                {assetCount > 0 && (
                  <p className="text-sm mt-3 mb-0" style={{ color: gold, fontWeight: 600 }}>
                    Still listed: {assetCount} item{assetCount === 1 ? "" : "s"} above to collect. Mark keys returned as they come back.
                  </p>
                )}
              </Card>
            ) : data.isSelf ? null : (
              <Card style={{ borderColor: `${rose}33` }}>
                <Eyebrow color={rose}>Offboard employee</Eyebrow>
                {!offOpen ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm m-0" style={{ color: dim }}>
                      {assetCount ? `They have ${assetCount} company item${assetCount === 1 ? "" : "s"} listed above to collect.` : "Nothing is listed above to collect."}
                    </p>
                    <PillButton variant="danger" onClick={() => setOffOpen(true)}>
                      Offboard {p.name.split(" ")[0]}
                    </PillButton>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="text-sm rounded-xl p-3" style={{ background: `${rose}0d`, color: ink }}>
                      This will, right away:
                      <ul className="mt-1 mb-0 pl-5 list-disc">
                        <li>
                          <strong>Disable their Microsoft 365 sign-in</strong> and sign them out everywhere (email, Teams, laptop)
                        </li>
                        <li>Block their portal login</li>
                        <li>Open an HR offboarding ticket and an IT ticket listing everything above to collect</li>
                      </ul>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="text-sm font-semibold" style={{ color: ink }}>
                        Last day
                        <input type="date" value={off.lastDay} onChange={(e) => setOff({ ...off, lastDay: e.target.value })} style={inputStyle} />
                      </label>
                      <label className="text-sm font-semibold" style={{ color: ink }}>
                        Type <span style={{ color: rose }}>{p.name}</span> to confirm
                        <input value={off.confirmName} onChange={(e) => setOff({ ...off, confirmName: e.target.value })} style={inputStyle} autoComplete="off" />
                      </label>
                    </div>
                    <label className="text-sm font-semibold" style={{ color: ink }}>
                      Notes for HR and IT
                      <textarea value={off.notes} onChange={(e) => setOff({ ...off, notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Anything they should know, e.g. where to pick up the laptop" />
                    </label>
                    <div className="flex gap-2">
                      <PillButton variant="danger" disabled={busy || off.confirmName.trim().toLowerCase() !== p.name.trim().toLowerCase()} onClick={offboard}>
                        {busy ? "Offboarding…" : "Disable sign-in & start offboarding"}
                      </PillButton>
                      <PillButton variant="ghost" onClick={() => setOffOpen(false)}>
                        Cancel
                      </PillButton>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
