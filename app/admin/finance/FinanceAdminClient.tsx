"use client";

import { useEffect, useState } from "react";

type Tier = {
  id: string;
  tier_order: number;
  tier_name: string;
  job_titles: string[];
  max_amount: number | null;
};

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

type DirUser = { id: string; name: string; email: string; jobTitle: string | null };

type ApprovalRequest = {
  id: string;
  request_id: string;
  amount: number;
  status: string;
  final_tier_name: string | null;
  created_at: string;
  ticket: { title: string; submitted_by: string; submitted_by_email: string } | null;
  pendingApprover: { name: string; email: string; jobTitle: string | null } | null;
  steps: {
    step_order: number;
    approver_name: string;
    chain_person_job_title: string | null;
    acting_as_delegate_for_email: string | null;
    status: string;
    decided_at: string | null;
    decision_note: string | null;
  }[];
};

const TABS = ["Tiers", "Temporary Coverage", "Active Requests"] as const;

export default function FinanceAdminClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Tiers");

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${
              tab === t
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Tiers" && <TiersTab />}
      {tab === "Temporary Coverage" && <DelegatesTab />}
      {tab === "Active Requests" && <RequestsTab />}
    </div>
  );
}

// ============================================================
// TIERS
// ============================================================
function TiersTab() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/finance/tiers");
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setTiers(body.tiers);
  }
  useEffect(() => {
    load();
  }, []);

  async function updateTier(id: string, patch: Partial<Tier>) {
    setError(null);
    const res = await fetch(`/api/admin/finance/tiers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    load();
  }

  async function deleteTier(id: string) {
    if (!confirm("Delete this tier? Any job titles mapped to it will no longer satisfy approval at this level.")) return;
    setError(null);
    const res = await fetch(`/api/admin/finance/tiers/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    load();
  }

  async function addTier() {
    setError(null);
    const nextOrder = tiers ? Math.max(0, ...tiers.map((t) => t.tier_order)) + 1 : 1;
    const res = await fetch("/api/admin/finance/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier_order: nextOrder, tier_name: "New Tier", job_titles: [], max_amount: null }),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    load();
  }

  if (!tiers) return <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>;

  return (
    <div>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Escalation order (lowest first). A tier's job titles are the real Azure AD job title
        strings that count for it — several titles can share a tier (e.g. all C-level roles).
        Leave max amount blank for "always sufficient, no matter the amount" (e.g. CEO).
      </p>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="space-y-3 mb-4">
        {tiers
          .sort((a, b) => a.tier_order - b.tier_order)
          .map((t) => (
            <div key={t.id} className="rounded-lg border border-[var(--color-border)] p-4">
              <div className="grid grid-cols-12 gap-3 items-start">
                <div className="col-span-1">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">Order</label>
                  <input
                    type="number"
                    defaultValue={t.tier_order}
                    onBlur={(e) => updateTier(t.id, { tier_order: Number(e.target.value) })}
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">Name</label>
                  <input
                    type="text"
                    defaultValue={t.tier_name}
                    onBlur={(e) => updateTier(t.id, { tier_name: e.target.value })}
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-5">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">
                    AD Job Titles (comma-separated)
                  </label>
                  <input
                    type="text"
                    defaultValue={t.job_titles.join(", ")}
                    onBlur={(e) =>
                      updateTier(t.id, {
                        job_titles: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">Max Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={t.max_amount ?? ""}
                    placeholder="Unlimited"
                    onBlur={(e) => updateTier(t.id, { max_amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-1 pt-5">
                  <button
                    onClick={() => deleteTier(t.id)}
                    className="text-xs text-red-600 hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>
      <button
        onClick={addTier}
        className="text-sm text-[var(--color-accent)] hover:underline cursor-pointer"
      >
        + Add Tier
      </button>
    </div>
  );
}

// ============================================================
// TEMPORARY COVERAGE (delegates)
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
    if (!confirm("Remove this coverage arrangement?")) return;
    const res = await fetch(`/api/admin/finance/delegates/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    load();
  }

  async function submitDelegate() {
    if (!original || !delegate) {
      setError("Pick both people from the directory search first.");
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

  if (!delegates) return <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Redirect a specific person's approval steps to someone else for a date range — e.g. an
        Area Manager on vacation. The chain still climbs from the original person's real manager
        afterward; the delegate is just who's asked in their place.
      </p>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="space-y-2 mb-4">
        {delegates.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)]">No coverage arrangements set up.</p>
        )}
        {delegates.map((d) => {
          const active = d.starts_at <= today && (!d.ends_at || d.ends_at >= today);
          return (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-medium">{d.original_name ?? d.original_email}</span>
                <span className="text-[var(--color-text-dim)]"> → covered by </span>
                <span className="font-medium">{d.delegate_name ?? d.delegate_email}</span>
                <div className="text-xs text-[var(--color-text-dim)] mt-0.5">
                  {d.starts_at} {d.ends_at ? `– ${d.ends_at}` : "– until removed"}
                  {d.note ? ` · ${d.note}` : ""}
                  {active ? " · active now" : ""}
                </div>
              </div>
              <button
                onClick={() => removeDelegate(d.id)}
                className="text-xs text-red-600 hover:underline cursor-pointer"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="text-sm text-[var(--color-accent)] hover:underline cursor-pointer"
        >
          + Set Up Temporary Coverage
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <DirectorySearch label="Person going out (original approver)" value={original} onChange={setOriginal} />
          <DirectorySearch label="Covering for them" value={delegate} onChange={setDelegate} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-dim)] mb-1">Starts</label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-dim)] mb-1">
                Ends (blank = until manually removed)
              </label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-dim)] mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={submitDelegate}
              className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectorySearch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DirUser | null;
  onChange: (u: DirUser | null) => void;
}) {
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
        <label className="block text-xs text-[var(--color-text-dim)] mb-1">{label}</label>
        <div className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1.5">
          <span className="text-sm">
            {value.name} <span className="text-[var(--color-text-dim)]">({value.email})</span>
          </span>
          <button onClick={() => onChange(null)} className="text-xs text-[var(--color-text-dim)] hover:underline cursor-pointer">
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-xs text-[var(--color-text-dim)] mb-1">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
      />
      {(results.length > 0 || searching) && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg max-h-48 overflow-y-auto">
          {searching && <div className="px-3 py-2 text-xs text-[var(--color-text-dim)]">Searching…</div>}
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                onChange(u);
                setQuery("");
                setResults([]);
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-black/5 cursor-pointer"
            >
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-[var(--color-text-dim)]">
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

// ============================================================
// ACTIVE REQUESTS
// ============================================================
function RequestsTab() {
  const [requests, setRequests] = useState<ApprovalRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/finance/requests")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setRequests(body.requests);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!requests) return <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? requests.filter(
        (r) =>
          r.ticket?.title.toLowerCase().includes(q) ||
          r.ticket?.submitted_by.toLowerCase().includes(q) ||
          r.ticket?.submitted_by_email.toLowerCase().includes(q)
      )
    : requests;

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by ticket title, submitter name, or email…"
        className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm mb-4"
      />
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)]">
            {requests.length === 0 ? "No finance approval requests yet." : "No matches."}
          </p>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="rounded-lg border border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center justify-between">
              <a
                href={`/helpdesk/${r.request_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline"
              >
                {r.ticket?.title ?? "Untitled"}
              </a>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  r.status === "approved"
                    ? "bg-green-100 text-green-700"
                    : r.status === "denied"
                      ? "bg-red-100 text-red-700"
                      : "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                }`}
              >
                {r.status}
              </span>
            </div>
            <div className="text-xs text-[var(--color-text-dim)] mt-1 mb-3">
              ${r.amount} · submitted by {r.ticket?.submitted_by ?? "unknown"} (
              {r.ticket?.submitted_by_email ?? "—"}) · {new Date(r.created_at).toLocaleDateString()}
              {r.final_tier_name && r.status !== "pending" && ` · resolved at ${r.final_tier_name} level`}
            </div>

            {/* Full step-by-step trail — this is the "who approved, who's it
                waiting on" answer for status-check questions, not just the
                current pending approver. */}
            <div className="space-y-1 border-t border-[var(--color-border)] pt-2">
              {[...r.steps]
                .sort((a, b) => a.step_order - b.step_order)
                .map((s) => (
                  <div key={s.step_order} className="flex items-center justify-between text-xs">
                    <span>
                      {s.step_order}. {s.approver_name}
                      {s.chain_person_job_title ? ` (${s.chain_person_job_title})` : ""}
                      {s.acting_as_delegate_for_email ? " — covering" : ""}
                    </span>
                    <span
                      className={
                        s.status === "approved"
                          ? "text-green-700 font-medium"
                          : s.status === "denied"
                            ? "text-red-600 font-medium"
                            : "text-[var(--color-accent)] font-medium"
                      }
                    >
                      {s.status === "pending" ? "⏳ awaiting response" : s.status}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
