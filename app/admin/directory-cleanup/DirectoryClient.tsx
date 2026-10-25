"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Suggestion } from "@/lib/directory/suggestOffice";
import { Button } from "../devices/ui";
import { card, dim, emerald, faint, gold, ink, line, relTime, rose } from "../devices/style";

export type OfficeOpt = { id: string; name: string; state: string | null; region: string | null };
export type DirRow = {
  id: string;
  name: string | null;
  upn: string;
  mail: string | null;
  enabled: boolean;
  guest: boolean;
  licensed: boolean;
  lastSignIn: string | null;
  created: string | null;
  officeLocation: string | null;
  matchedOfficeId: string | null;
  department: string | null;
  jobTitle: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  company: string | null;
  linked: boolean;
  suggestion: Suggestion | null;
};

type View = "needs" | "assigned" | "guests";
type Result = { done: number; failed: { name: string; error: string }[]; skipped: number };

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : Infinity);
const guestEmail = (upn: string) => {
  // jane_gmail.com#EXT#@tenant.onmicrosoft.com → jane@gmail.com
  const local = upn.split("#EXT#")[0];
  const i = local.lastIndexOf("_");
  return i > 0 ? `${local.slice(0, i)}@${local.slice(i + 1)}` : upn;
};

const input: React.CSSProperties = { border: `1px solid ${line}`, borderRadius: 10, padding: "8px 10px", background: "#fff", color: ink, minWidth: 0 };

export default function DirectoryClient({ rows, offices }: { rows: DirRow[]; offices: OfficeOpt[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("needs");
  const [q, setQ] = useState("");
  const [licensedOnly, setLicensedOnly] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);
  const [guestState, setGuestState] = useState<"enabled" | "disabled">("enabled");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkOffice, setBulkOffice] = useState("");
  const [rowOffice, setRowOffice] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const officeName = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);
  const staff = useMemo(() => rows.filter((r) => !r.guest && r.enabled), [rows]);
  const counts = {
    needs: staff.filter((r) => !r.matchedOfficeId).length,
    assigned: staff.filter((r) => r.matchedOfficeId).length,
    guests: rows.filter((r) => r.guest && r.enabled).length,
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (view === "guests") {
        if (!r.guest || (guestState === "enabled") !== r.enabled) return false;
      } else {
        if (r.guest || !r.enabled) return false;
        if (view === "needs" ? r.matchedOfficeId : !r.matchedOfficeId) return false;
        if (licensedOnly && !r.licensed) return false;
        if (activeOnly && days(r.lastSignIn) > 90) return false;
      }
      if (needle && ![r.name, r.upn, r.officeLocation, r.state, r.city, r.department, r.jobTitle].some((v) => v?.toLowerCase().includes(needle))) return false;
      return true;
    });
    return view === "guests"
      ? out.sort((a, b) => (a.lastSignIn ?? "").localeCompare(b.lastSignIn ?? ""))
      : out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [rows, view, q, licensedOnly, activeOnly, guestState]);

  const withSuggestion = view === "needs" ? list.filter((r) => r.suggestion && r.suggestion.confidence !== "weak") : [];
  const allSelected = list.length > 0 && list.every((r) => sel.has(r.id));

  function switchView(v: View) {
    setView(v);
    setSel(new Set());
    setResult(null);
    setErr(null);
  }
  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function post(payload: object): Promise<Result> {
    const res = await fetch("/api/devices/directory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "Failed");
    return d;
  }

  async function run(fn: () => Promise<Result>) {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await fn());
      setSel(new Set());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const assign = (ids: string[], officeId: string) => run(() => post({ action: "assign", ids, officeId }));

  function acceptSuggestions() {
    const groups = new Map<string, string[]>();
    for (const r of withSuggestion) {
      if (sel.size && !sel.has(r.id)) continue;
      const oid = r.suggestion!.officeId;
      groups.set(oid, [...(groups.get(oid) ?? []), r.id]);
    }
    const n = [...groups.values()].reduce((a, g) => a + g.length, 0);
    if (!n || !confirm(`Set Office Location in Entra for ${n} people, using the suggested office for each?`)) return;
    run(async () => {
      const total: Result = { done: 0, failed: [], skipped: 0 };
      for (const [oid, ids] of groups) {
        const r = await post({ action: "assign", ids, officeId: oid });
        total.done += r.done;
        total.failed.push(...r.failed);
        total.skipped += r.skipped;
      }
      return total;
    });
  }

  function bulkAssign() {
    if (!bulkOffice) return;
    if (!confirm(`Set Office Location to "${officeName.get(bulkOffice)}" for ${sel.size} people in Entra?`)) return;
    assign([...sel], bulkOffice);
  }

  function toggleGuests() {
    const action = guestState === "enabled" ? "disable" : "enable";
    if (!confirm(`${action === "disable" ? "Disable" : "Re-enable"} ${sel.size} guest account${sel.size === 1 ? "" : "s"} in Entra?`)) return;
    run(() => post({ action, ids: [...sel], reason }));
  }

  const tab = (v: View, label: string, n: number) => (
    <button
      key={v}
      onClick={() => switchView(v)}
      style={{
        border: `1.5px solid ${view === v ? emerald : line}`,
        background: view === v ? emerald : "#fff",
        color: view === v ? "#fff" : ink,
        borderRadius: 999,
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label} · {n}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {tab("needs", "Needs an office", counts.needs)}
        {tab("assigned", "Has an office", counts.assigned)}
        {tab("guests", "Guest accounts", counts.guests)}
      </div>

      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, location…" style={{ ...input, flex: "1 1 220px" }} />
        {view !== "guests" ? (
          <>
            <label style={{ fontSize: 13, color: dim, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={licensedOnly} onChange={(e) => setLicensedOnly(e.target.checked)} /> Licensed only
            </label>
            <label style={{ fontSize: 13, color: dim, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Signed in within 90 days
            </label>
          </>
        ) : (
          <select value={guestState} onChange={(e) => (setGuestState(e.target.value as "enabled" | "disabled"), setSel(new Set()))} style={input}>
            <option value="enabled">Still enabled</option>
            <option value="disabled">Already disabled</option>
          </select>
        )}
      </div>

      {/* Action bar */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
          <input type="checkbox" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(list.map((r) => r.id)))} />
          {sel.size ? `${sel.size} selected` : `Select all ${list.length}`}
        </label>
        {view === "guests" ? (
          <>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. stale guest cleanup)" style={{ ...input, flex: "1 1 200px" }} />
            <Button variant={guestState === "enabled" ? "danger" : "primary"} disabled={busy || !sel.size || reason.trim().length < 5} onClick={toggleGuests}>
              {guestState === "enabled" ? "Disable selected" : "Re-enable selected"}
            </Button>
          </>
        ) : (
          <>
            <select value={bulkOffice} onChange={(e) => setBulkOffice(e.target.value)} style={{ ...input, flex: "1 1 200px" }}>
              <option value="">Assign selected to…</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} {o.state ? `(${o.state})` : ""}
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={busy || !sel.size || !bulkOffice} onClick={bulkAssign}>
              Assign
            </Button>
            {withSuggestion.length > 0 && (
              <Button disabled={busy} onClick={acceptSuggestions}>
                Accept {sel.size ? "selected " : ""}suggestions ({sel.size ? withSuggestion.filter((r) => sel.has(r.id)).length : withSuggestion.length})
              </Button>
            )}
          </>
        )}
      </div>

      {err && <p style={{ color: rose, fontSize: 14, marginBottom: 10 }}>{err}</p>}
      {result && (
        <p style={{ fontSize: 14, marginBottom: 10, color: result.failed.length ? gold : emerald }}>
          Updated {result.done} in Entra.
          {result.skipped > 0 && ` Skipped ${result.skipped}.`}
          {result.failed.length > 0 && ` ${result.failed.length} failed: ${result.failed.slice(0, 3).map((f) => `${f.name} (${f.error})`).join("; ")}`}
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {list.length === 0 && <div style={{ ...card, color: dim, fontSize: 14 }}>Nothing here with these filters.</div>}
        {list.slice(0, 400).map((r) => (
          <div key={r.id} style={{ ...card, padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={{ marginTop: 4, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline" }}>
                <b style={{ color: ink, fontSize: 15 }}>{r.name || "(no name)"}</b>
                <span style={{ color: faint, fontSize: 12, overflowWrap: "anywhere" }}>{r.guest ? guestEmail(r.upn) : r.mail || r.upn}</span>
              </div>

              {view === "guests" ? (
                <div style={{ fontSize: 13, color: dim, marginTop: 4 }}>
                  Last sign-in {r.lastSignIn ? relTime(r.lastSignIn) : "never"}
                  {r.created ? ` · added ${relTime(r.created)}` : ""}
                  {r.company ? ` · ${r.company}` : ""}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    <Chip label="Office Location" value={r.officeLocation} />
                    <Chip label="State" value={r.state} />
                    <Chip label="City" value={r.city} />
                    <Chip label="Address" value={r.address} />
                    <Chip label="Dept" value={r.department} />
                    <Chip label="Title" value={r.jobTitle} />
                  </div>
                  <div style={{ fontSize: 12, color: faint, marginTop: 6 }}>
                    {r.licensed ? "Licensed" : "No license"} · last sign-in {r.lastSignIn ? relTime(r.lastSignIn) : "never"}
                    {r.linked ? " · has portal profile" : ""}
                  </div>

                  {view === "assigned" ? (
                    <div style={{ fontSize: 13, color: emerald, marginTop: 8, fontWeight: 600 }}>✓ {officeName.get(r.matchedOfficeId!)}</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                      {r.suggestion && (
                        <span style={{ fontSize: 13, color: r.suggestion.confidence === "weak" ? gold : emerald }}>
                          {r.suggestion.confidence === "weak" ? "Maybe" : "Suggested"}: <b>{officeName.get(r.suggestion.officeId)}</b>{" "}
                          <span style={{ color: faint }}>({r.suggestion.why})</span>
                        </span>
                      )}
                      <select
                        value={rowOffice[r.id] ?? (r.suggestion && r.suggestion.confidence !== "weak" ? r.suggestion.officeId : "")}
                        onChange={(e) => setRowOffice((m) => ({ ...m, [r.id]: e.target.value }))}
                        style={{ ...input, flex: "1 1 180px" }}
                      >
                        <option value="">Pick an office…</option>
                        {offices.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} {o.state ? `(${o.state})` : ""}
                          </option>
                        ))}
                      </select>
                      <Button
                        small
                        variant="primary"
                        disabled={busy || !(rowOffice[r.id] ?? (r.suggestion?.confidence !== "weak" ? r.suggestion?.officeId : ""))}
                        onClick={() => assign([r.id], (rowOffice[r.id] ?? r.suggestion?.officeId)!)}
                      >
                        Assign
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {list.length > 400 && <p style={{ fontSize: 13, color: dim }}>Showing the first 400 of {list.length}. Narrow it with search or filters. Select all still covers all {list.length}.</p>}
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | null }) {
  return (
    <span style={{ fontSize: 12, borderRadius: 8, padding: "3px 8px", background: value ? "#EEF6F1" : "rgba(22,48,43,0.04)", color: value ? ink : faint }}>
      <span style={{ color: faint }}>{label}:</span> {value || "—"}
    </span>
  );
}
