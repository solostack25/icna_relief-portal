"use client";

import { useEffect, useMemo, useState } from "react";

type OfficeRow = {
  id: string;
  name: string;
  state: string;
  region: string;
  inkind_prefix?: string;
  cash_prefix?: string;
  salesforce_account_id?: string | null;
  salesforce_account_name?: string | null;
};
type Candidate = { id: string; name: string; city: string | null; state: string | null };

// InKind Admin → Settings → Offices: each office's invoice / receipt
// prefixes and the Salesforce Account its in-kind records go to.
export default function OfficeSettings() {
  const [rows, setRows] = useState<OfficeRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ inkind_prefix: "", cash_prefix: "", salesforce_account_id: "", salesforce_account_name: "" });
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/inkind-admin/offices");
    const data = await res.json();
    setRows(data.offices ?? []);
    setCanEdit(!!data.canEdit);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !t || `${r.name} ${r.state} ${r.inkind_prefix ?? ""}`.toLowerCase().includes(t));
  }, [rows, q]);
  const connected = rows.filter((r) => r.salesforce_account_id).length;

  function startEdit(r: OfficeRow) {
    setEditing(r.id);
    setCandidates(null);
    setMsg(null);
    setDraft({
      inkind_prefix: r.inkind_prefix ?? "",
      cash_prefix: r.cash_prefix ?? "",
      salesforce_account_id: r.salesforce_account_id ?? "",
      salesforce_account_name: r.salesforce_account_name ?? "",
    });
  }

  async function find(officeId: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/inkind-admin/offices?find=${officeId}`);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "Couldn't search Salesforce");
    setCandidates(data.candidates ?? []);
  }

  async function save(officeId: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/inkind-admin/offices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ office_id: officeId, ...draft }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "Couldn't save");
    setEditing(null);
    await load();
  }

  const input = "rounded-lg border border-gray-300 px-2 py-1.5 text-sm";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
      <h2 className="font-semibold text-gray-700 mb-1">Offices</h2>
      <p className="text-xs text-gray-400 mb-3">
        Each office&apos;s in-kind invoice prefix (e.g. TXHOU-10182026-001), cash/check receipt prefix, and the Salesforce Account
        its in-kind records are filed under. If an office&apos;s Account is blank, the first push looks it up by name (&quot;TX -
        Houston…&quot;) and saves it. {connected} of {rows.length} offices connected to Salesforce.
      </p>
      <input placeholder="Search offices" value={q} onChange={(e) => setQ(e.target.value)} className={input + " w-full mb-3"} />
      <div className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
        {filtered.map((r) =>
          editing === r.id ? (
            <div key={r.id} className="py-3 space-y-2">
              <div className="font-medium text-sm">
                {r.state} – {r.name}
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="text-xs text-gray-500">
                  Invoice prefix
                  <input value={draft.inkind_prefix} onChange={(e) => setDraft({ ...draft, inkind_prefix: e.target.value.toUpperCase() })} className={input + " block w-24 mt-1 uppercase"} />
                </label>
                <label className="text-xs text-gray-500">
                  Cash/check prefix
                  <input value={draft.cash_prefix} onChange={(e) => setDraft({ ...draft, cash_prefix: e.target.value.toUpperCase() })} className={input + " block w-28 mt-1 uppercase"} />
                </label>
                <label className="text-xs text-gray-500 flex-1 min-w-[12rem]">
                  Salesforce Account ID
                  <input value={draft.salesforce_account_id} onChange={(e) => setDraft({ ...draft, salesforce_account_id: e.target.value.trim(), salesforce_account_name: "" })} placeholder="001…" className={input + " block w-full mt-1 font-mono"} />
                </label>
              </div>
              {draft.salesforce_account_name && <div className="text-xs text-gray-500">Account: {draft.salesforce_account_name}</div>}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => find(r.id)} disabled={busy} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-50">
                  Find in Salesforce
                </button>
                <button onClick={() => save(r.id)} disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  Save
                </button>
                <button onClick={() => setEditing(null)} className="text-xs text-gray-500 underline">
                  Cancel
                </button>
              </div>
              {candidates && (
                <div className="rounded-lg bg-gray-50 p-2 space-y-1">
                  {candidates.length === 0 && <div className="text-xs text-gray-500">No Accounts found in {r.state}. Paste the Account ID instead.</div>}
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setDraft({ ...draft, salesforce_account_id: c.id, salesforce_account_name: c.name })}
                      className={
                        "block w-full text-left rounded px-2 py-1 text-xs " +
                        (draft.salesforce_account_id === c.id ? "bg-brand-light text-brand-dark font-semibold" : "hover:bg-white")
                      }
                    >
                      {c.name}
                      <span className="text-gray-400">
                        {" "}· {[c.city, c.state].filter(Boolean).join(", ")} · {c.id}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>
          ) : (
            <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm">
                  {r.state} – {r.name}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  <span className="font-mono">{r.inkind_prefix}</span> · <span className="font-mono">{r.cash_prefix}</span> ·{" "}
                  {r.salesforce_account_id ? (
                    <span className="text-green-700">✓ {r.salesforce_account_name || r.salesforce_account_id}</span>
                  ) : (
                    <span>Salesforce Account not set</span>
                  )}
                </div>
              </div>
              {canEdit && (
                <button onClick={() => startEdit(r)} className="text-xs text-brand-dark underline shrink-0">
                  Edit
                </button>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}
