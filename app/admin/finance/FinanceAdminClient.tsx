"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
const TAB_KEYS: Record<(typeof TABS)[number], string> = {
  Tiers: "finance.tab.tiers",
  "Temporary Coverage": "finance.tab.temporaryCoverage",
  "Active Requests": "finance.tab.activeRequests",
};

export default function FinanceAdminClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Tiers");
  const { t } = useLanguage();

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-[var(--color-border)]">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${
              tab === tb
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            {t(TAB_KEYS[tb])}
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
  const { t } = useLanguage();

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
    if (!confirm(t("finance.tiers.confirmDelete"))) return;
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
      body: JSON.stringify({ tier_order: nextOrder, tier_name: t("finance.tiers.newTierDefault"), job_titles: [], max_amount: null }),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    load();
  }

  if (!tiers) return <p className="text-sm text-[var(--color-text-dim)]">{t("finance.tiers.loading")}</p>;

  return (
    <div>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        {t("finance.tiers.explainer")}
      </p>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="space-y-3 mb-4">
        {tiers
          .sort((a, b) => a.tier_order - b.tier_order)
          .map((tr) => (
            <div key={tr.id} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="col-span-1 sm:col-span-1">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">{t("finance.tiers.order")}</label>
                  <input
                    type="number"
                    defaultValue={tr.tier_order}
                    onBlur={(e) => updateTier(tr.id, { tier_order: Number(e.target.value) })}
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-1 sm:col-span-3">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">{t("finance.tiers.name")}</label>
                  <input
                    type="text"
                    defaultValue={tr.tier_name}
                    onBlur={(e) => updateTier(tr.id, { tier_name: e.target.value })}
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-1 sm:col-span-5">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">
                    {t("finance.tiers.adJobTitles")}
                  </label>
                  <input
                    type="text"
                    defaultValue={tr.job_titles.join(", ")}
                    onBlur={(e) =>
                      updateTier(tr.id, {
                        job_titles: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs text-[var(--color-text-dim)] mb-1">{t("finance.tiers.maxAmount")}</label>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={tr.max_amount ?? ""}
                    placeholder={t("finance.tiers.unlimited")}
                    onBlur={(e) => updateTier(tr.id, { max_amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-1 sm:col-span-1 pt-5">
                  <button
                    onClick={() => deleteTier(tr.id)}
                    className="text-xs text-red-600 hover:underline cursor-pointer"
                  >
                    {t("finance.tiers.delete")}
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
        {t("finance.tiers.addTier")}
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
  const { t } = useLanguage();

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
    if (!confirm(t("finance.delegates.confirmRemove"))) return;
    const res = await fetch(`/api/admin/finance/delegates/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    load();
  }

  async function submitDelegate() {
    if (!original || !delegate) {
      setError(t("finance.delegates.pickBothPeople"));
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

  if (!delegates) return <p className="text-sm text-[var(--color-text-dim)]">{t("finance.tiers.loading")}</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        {t("finance.delegates.explainer")}
      </p>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="space-y-2 mb-4">
        {delegates.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)]">{t("finance.delegates.noneSetUp")}</p>
        )}
        {delegates.map((d) => {
          const active = d.starts_at <= today && (!d.ends_at || d.ends_at >= today);
          return (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-white px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-medium">{d.original_name ?? d.original_email}</span>
                <span className="text-[var(--color-text-dim)]"> {t("finance.delegates.coveredBy")} </span>
                <span className="font-medium">{d.delegate_name ?? d.delegate_email}</span>
                <div className="text-xs text-[var(--color-text-dim)] mt-0.5">
                  {d.starts_at} {d.ends_at ? `– ${d.ends_at}` : t("finance.delegates.untilRemoved")}
                  {d.note ? ` · ${d.note}` : ""}
                  {active ? ` · ${t("finance.delegates.activeNow")}` : ""}
                </div>
              </div>
              <button
                onClick={() => removeDelegate(d.id)}
                className="text-xs text-red-600 hover:underline cursor-pointer"
              >
                {t("finance.delegates.remove")}
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
          {t("finance.delegates.setUpButton")}
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 space-y-3">
          <DirectorySearch label={t("finance.delegates.personGoingOut")} value={original} onChange={setOriginal} />
          <DirectorySearch label={t("finance.delegates.coveringForThem")} value={delegate} onChange={setDelegate} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-dim)] mb-1">{t("finance.delegates.starts")}</label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-dim)] mb-1">
                {t("finance.delegates.endsBlank")}
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
              {t("finance.delegates.save")}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
            >
              {t("finance.delegates.cancel")}
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
  const { t } = useLanguage();

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
            {t("finance.dirSearch.change")}
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
        placeholder={t("finance.dirSearch.searchPlaceholder")}
        className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
      />
      {(results.length > 0 || searching) && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg max-h-48 overflow-y-auto">
          {searching && <div className="px-3 py-2 text-xs text-[var(--color-text-dim)]">{t("finance.dirSearch.searching")}</div>}
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
  const { t } = useLanguage();

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
  if (!requests) return <p className="text-sm text-[var(--color-text-dim)]">{t("finance.tiers.loading")}</p>;

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
        placeholder={t("finance.requests.searchPlaceholder")}
        className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm mb-4"
      />
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)]">
            {requests.length === 0 ? t("finance.requests.noneYet") : t("finance.requests.noMatches")}
          </p>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={`/helpdesk/${r.request_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline min-w-0 truncate"
              >
                {r.ticket?.title ?? t("finance.requests.untitled")}
              </a>
              <span
                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
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
              ${r.amount} · {t("finance.requests.submittedBy")} {r.ticket?.submitted_by ?? "unknown"} (
              {r.ticket?.submitted_by_email ?? "—"}) · {new Date(r.created_at).toLocaleDateString()}
              {r.final_tier_name && r.status !== "pending" && ` · ${t("finance.requests.resolvedAtLevel").replace("{tier}", r.final_tier_name)}`}
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
                      {s.acting_as_delegate_for_email ? ` ${t("finance.requests.covering")}` : ""}
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
                      {s.status === "pending" ? t("finance.requests.awaitingResponse") : s.status}
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
