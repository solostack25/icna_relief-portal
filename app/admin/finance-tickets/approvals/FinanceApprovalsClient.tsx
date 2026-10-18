"use client";

import { useEffect, useState } from "react";

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const pillButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});

// ============================================================
// Types
// ============================================================
type DirUser = { id: string; name: string; email: string; jobTitle: string | null };
type Delegate = {
  id: string;
  original_email: string;
  original_name: string | null;
  delegate_email: string;
  delegate_name: string | null;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
};
// Out-of-office approval coverage. (The per-ticket "who is it waiting on"
// view that used to be a second tab here now lives in the Ticket Queue.)
export default function FinanceApprovalsClient() {
  return <DelegatesTab />;
}

// ============================================================
// TEMPORARY COVERAGE (delegates) - reuses the existing
// /api/admin/finance/delegates endpoints as-is: the underlying
// finance_approval_delegates table never changed, and
// lib/financeTickets.ts's resolveDelegate() already reads from it -
// this tab is the only thing that went missing, not the mechanism.
// ============================================================
function DelegatesTab() {
  const [delegates, setDelegates] = useState<Delegate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [original, setOriginal] = useState<DirUser | null>(null);
  const [delegate, setDelegate] = useState<DirUser | null>(null);
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    const res = await fetch("/api/admin/finance/delegates");
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setDelegates(body.delegates);
  }
  useEffect(() => {
    load();
  }, []);

  async function removeDelegate(id: string) {
    if (!confirm("Remove this coverage assignment?")) return;
    const res = await fetch(`/api/admin/finance/delegates/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    load();
  }

  async function submitDelegate() {
    if (!original || !delegate) {
      setError("Pick both people first.");
      return;
    }
    setError(null);
    const res = await fetch("/api/admin/finance/delegates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        original_email: original.email,
        original_name: original.name,
        delegate_email: delegate.email,
        delegate_name: delegate.name,
        starts_at: startsAt,
        ends_at: endsAt || null,
        note: note || null,
      }),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setOriginal(null);
    setDelegate(null);
    setEndsAt("");
    setNote("");
    setShowForm(false);
    load();
  }

  if (!delegates) return <p style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <p style={{ fontSize: 12, color: "rgba(22,48,43,0.5)", marginBottom: 16 }}>
        When someone's out, their finance ticket approvals route to whoever's covering for them instead - applies
        automatically at every approval level, for every category.
      </p>
      {error && <p style={{ fontSize: 13, color: "#B5566B", marginBottom: 12 }}>{error}</p>}

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {delegates.length === 0 && <p style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>No coverage set up.</p>}
        {delegates.map((d) => {
          const active = d.starts_at <= today && (!d.ends_at || d.ends_at >= today);
          return (
            <div key={d.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{d.original_name ?? d.original_email}</span>
                <span style={{ color: "rgba(22,48,43,0.5)" }}> covered by </span>
                <span style={{ fontWeight: 600 }}>{d.delegate_name ?? d.delegate_email}</span>
                <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)", marginTop: 2 }}>
                  {d.starts_at} {d.ends_at ? `– ${d.ends_at}` : "until removed"}
                  {d.note ? ` · ${d.note}` : ""}
                  {active ? " · Active now" : ""}
                </div>
              </div>
              <button onClick={() => removeDelegate(d.id)} style={{ fontSize: 12, color: "#B5566B", fontWeight: 600 }}>
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={pillButton(false)}>
          + Set Up Coverage
        </button>
      ) : (
        <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
          <DirectorySearch label="Person going out" value={original} onChange={setOriginal} />
          <DirectorySearch label="Covering for them" value={delegate} onChange={setDelegate} />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)", marginBottom: 4 }}>Starts</div>
              <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)", marginBottom: 4 }}>Ends (blank = until removed)</div>
              <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
            </div>
          </div>
          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={submitDelegate} style={pillButton(true)}>
              Save
            </button>
            <button onClick={() => setShowForm(false)} style={pillButton(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectorySearch({ label, value, onChange }: { label: string; value: DirUser | null; onChange: (u: DirUser | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/admin/finance/directory-search?q=${encodeURIComponent(query)}`);
      const body = await res.json();
      setResults(res.ok ? body.users : []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  if (value) {
    return (
      <div>
        <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)", marginBottom: 4 }}>{label}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...inputStyle }}>
          <span style={{ fontSize: 13 }}>
            {value.name} <span style={{ color: "rgba(22,48,43,0.5)" }}>({value.email})</span>
          </span>
          <button onClick={() => onChange(null)} style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)", marginBottom: 4 }}>{label}</div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…" style={{ ...inputStyle, width: "100%" }} />
      {(results.length > 0 || searching) && (
        <div style={{ position: "absolute", zIndex: 10, marginTop: 4, width: "100%", background: "#fff", border: "1px solid rgba(22,48,43,0.1)", borderRadius: 10, maxHeight: 180, overflowY: "auto" }}>
          {searching && <div style={{ padding: "8px 12px", fontSize: 12, color: "rgba(22,48,43,0.5)" }}>Searching…</div>}
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                onChange(u);
                setQuery("");
                setResults([]);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13 }}
            >
              <div style={{ fontWeight: 600 }}>{u.name}</div>
              <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
                {u.email}
                {u.jobTitle ? ` · ${u.jobTitle}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
