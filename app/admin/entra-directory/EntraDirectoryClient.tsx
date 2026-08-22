"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type EntraUser = {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  managerId: string | null;
  managerDisplayName: string | null;
};

type AdpRow = {
  payrollName: string;
  fullNameForSorting: string;
  jobTitle: string;
  department: string;
  reportsToName: string;
};

type MatchedRow = AdpRow & {
  key: string;
  matchedUserId: string | null;
  matchedManagerUserId: string | null;
  titleDiffers: boolean;
  managerDiffers: boolean;
};

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(22,48,43,0.15)",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 13,
  background: "#fff",
  width: "100%",
};

// Drops middle initials/single-letter tokens and sorts so word order
// differences ("First Last" vs "Last First") don't matter - this is a
// best-effort exact-token match, not fuzzy string distance. Good enough
// for matching a clean ADP export against Entra displayName; anything
// that doesn't land an exact match falls to manual picking rather than
// guessing at a lower-confidence match.
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .sort()
    .join(" ");
}

// ADP's "Reports To Name" / "Payroll Name" columns are "Last, First MI".
function normalizePayrollName(s: string): string {
  const [last, rest] = s.split(",").map((p) => p.trim());
  if (!rest) return normalizeName(s);
  return normalizeName(`${rest} ${last}`);
}

export default function EntraDirectoryClient() {
  const [directory, setDirectory] = useState<EntraUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<EntraUser>>>({});

  const [adpRows, setAdpRows] = useState<AdpRow[] | null>(null);
  const [showAllAdpRows, setShowAllAdpRows] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState({ done: 0, total: 0 });
  const [applyResults, setApplyResults] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/entra-directory")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDirectory(data.users);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load directory"));
  }, []);

  const nameIndex = useMemo(() => {
    const index = new Map<string, EntraUser[]>();
    for (const u of directory ?? []) {
      const key = normalizeName(u.displayName);
      if (!index.has(key)) index.set(key, []);
      index.get(key)!.push(u);
    }
    return index;
  }, [directory]);

  function lookupSingle(index: Map<string, EntraUser[]>, key: string): EntraUser | null {
    const candidates = index.get(key);
    return candidates && candidates.length === 1 ? candidates[0] : null;
  }

  const matchedRows: MatchedRow[] = useMemo(() => {
    if (!adpRows || !directory) return [];
    return adpRows.map((row, i) => {
      const selfKey = normalizeName(row.fullNameForSorting);
      const matched = lookupSingle(nameIndex, selfKey);
      const managerKey = row.reportsToName ? normalizePayrollName(row.reportsToName) : "";
      const matchedManager = managerKey ? lookupSingle(nameIndex, managerKey) : null;

      const titleDiffers = !!matched && (matched.jobTitle ?? "").trim() !== row.jobTitle.trim();
      const managerDiffers = !!matched && !!matchedManager && matched.managerId !== matchedManager.id;

      return {
        ...row,
        key: `${i}-${row.payrollName}`,
        matchedUserId: matched?.id ?? null,
        matchedManagerUserId: matchedManager?.id ?? null,
        titleDiffers,
        managerDiffers,
      };
    });
  }, [adpRows, directory, nameIndex]);

  const visibleRows = showAllAdpRows ? matchedRows : matchedRows.filter((r) => !r.matchedUserId || r.titleDiffers || r.managerDiffers);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const parsed: AdpRow[] = rows
        .map((r) => ({
          payrollName: String(r["Payroll Name"] ?? "").trim(),
          fullNameForSorting: String(r["Full Name for Sorting"] ?? "").trim(),
          jobTitle: String(r["Job Title Description"] ?? "").trim(),
          department: String(r["Home Department Description"] ?? "").trim(),
          reportsToName: String(r["Reports To Name"] ?? "").trim(),
        }))
        .filter((r) => r.fullNameForSorting);
      setAdpRows(parsed);
      setApplyResults({});
    };
    reader.readAsBinaryString(file);
  }

  // Default-check only the rows that are matched AND actually differ -
  // unmatched rows need a manual pick first, and unchanged rows have
  // nothing to apply.
  useEffect(() => {
    const defaults = new Set(matchedRows.filter((r) => r.matchedUserId && (r.titleDiffers || r.managerDiffers)).map((r) => r.key));
    setCheckedKeys(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adpRows]);

  function toggleChecked(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function applySelected() {
    const rowsToApply = matchedRows.filter((r) => checkedKeys.has(r.key) && r.matchedUserId);
    setApplying(true);
    setApplyProgress({ done: 0, total: rowsToApply.length });
    const results: Record<string, string> = {};

    for (const row of rowsToApply) {
      try {
        const res = await fetch("/api/admin/entra-directory/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: row.matchedUserId,
            jobTitle: row.titleDiffers ? row.jobTitle : undefined,
            department: row.department || undefined,
            managerId: row.managerDiffers && row.matchedManagerUserId ? row.matchedManagerUserId : undefined,
          }),
        });
        const data = await res.json();
        results[row.key] = res.ok ? "✓ Updated" : `✗ ${data.error ?? "Failed"}`;
      } catch (e) {
        results[row.key] = `✗ ${e instanceof Error ? e.message : "Failed"}`;
      }
      setApplyProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setApplyResults(results);
    setApplying(false);

    // Refresh directory so the table reflects what actually landed.
    const res = await fetch("/api/admin/entra-directory");
    const data = await res.json();
    if (!data.error) setDirectory(data.users);
  }

  async function saveRow(userId: string) {
    const change = edits[userId];
    if (!change) return;
    setSavingId(userId);
    try {
      const res = await fetch("/api/admin/entra-directory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          jobTitle: change.jobTitle,
          department: change.department,
          officeLocation: change.officeLocation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDirectory((prev) => prev?.map((u) => (u.id === userId ? { ...u, ...change } : u)) ?? prev);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  const filteredDirectory = (directory ?? []).filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.displayName.toLowerCase().includes(q) || (u.mail ?? "").toLowerCase().includes(q) || (u.jobTitle ?? "").toLowerCase().includes(q);
  });

  if (loadError) {
    return (
      <p className="text-sm" style={{ color: "#B3261E" }}>
        {loadError}
      </p>
    );
  }

  return (
    <div>
      {/* ADP Import */}
      <div className="rounded-2xl mb-10 p-5" style={{ background: "#fff", border: "1px solid rgba(22,48,43,0.1)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Import from ADP Export</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.55)" }}>
          Upload the ADP "All Staff Profiles" export. Rows are matched to Entra users by name — only rows with a
          confident match and an actual difference are checked by default. Review before applying; nothing writes
          to Entra until you click Apply.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="text-sm"
        />

        {adpRows && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm" style={{ color: "rgba(22,48,43,0.6)" }}>
                {matchedRows.length} rows parsed · {matchedRows.filter((r) => r.matchedUserId).length} matched ·{" "}
                {matchedRows.filter((r) => !r.matchedUserId).length} unmatched ·{" "}
                {matchedRows.filter((r) => r.titleDiffers || r.managerDiffers).length} with differences
              </p>
              <label className="text-sm flex items-center gap-1.5" style={{ color: "rgba(22,48,43,0.6)" }}>
                <input type="checkbox" checked={showAllAdpRows} onChange={(e) => setShowAllAdpRows(e.target.checked)} />
                Show all rows (not just diffs/unmatched)
              </label>
            </div>

            <div className="rounded-lg overflow-hidden mb-4" style={{ border: "1px solid rgba(22,48,43,0.1)", maxHeight: 480, overflowY: "auto" }}>
              <table className="w-full text-xs">
                <thead style={{ position: "sticky", top: 0, background: "#FAF8F2" }}>
                  <tr>
                    <th className="px-2 py-2 text-left"></th>
                    <th className="px-2 py-2 text-left">ADP Name</th>
                    <th className="px-2 py-2 text-left">Matched Entra User</th>
                    <th className="px-2 py-2 text-left">Title (current → ADP)</th>
                    <th className="px-2 py-2 text-left">Manager</th>
                    <th className="px-2 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const matchedUser = (directory ?? []).find((u) => u.id === row.matchedUserId);
                    const matchedManager = (directory ?? []).find((u) => u.id === row.matchedManagerUserId);
                    return (
                      <tr key={row.key} style={{ borderTop: "1px solid rgba(22,48,43,0.06)" }}>
                        <td className="px-2 py-1.5">
                          {row.matchedUserId && (
                            <input type="checkbox" checked={checkedKeys.has(row.key)} onChange={() => toggleChecked(row.key)} />
                          )}
                        </td>
                        <td className="px-2 py-1.5" style={{ fontWeight: 600 }}>
                          {row.fullNameForSorting}
                        </td>
                        <td className="px-2 py-1.5">
                          {matchedUser ? (
                            <span>{matchedUser.mail ?? matchedUser.userPrincipalName}</span>
                          ) : (
                            <span style={{ color: "#B3261E" }}>No match</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.titleDiffers ? (
                            <span>
                              <span style={{ color: "rgba(22,48,43,0.4)", textDecoration: "line-through" }}>
                                {matchedUser?.jobTitle || "(blank)"}
                              </span>{" "}
                              → <span style={{ fontWeight: 600 }}>{row.jobTitle}</span>
                            </span>
                          ) : (
                            <span style={{ color: "rgba(22,48,43,0.4)" }}>{row.jobTitle}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.managerDiffers ? (
                            <span>
                              <span style={{ color: "rgba(22,48,43,0.4)", textDecoration: "line-through" }}>
                                {matchedUser?.managerDisplayName || "(none)"}
                              </span>{" "}
                              → <span style={{ fontWeight: 600 }}>{matchedManager?.displayName}</span>
                            </span>
                          ) : (
                            <span style={{ color: "rgba(22,48,43,0.4)" }}>{row.reportsToName}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">{applyResults[row.key]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={applySelected}
                disabled={applying || checkedKeys.size === 0}
                className="text-sm font-semibold px-5 py-2.5 rounded-lg"
                style={{ background: "var(--icna-green, #2F6D46)", color: "#fff", opacity: applying || checkedKeys.size === 0 ? 0.5 : 1 }}
              >
                {applying ? `Applying ${applyProgress.done}/${applyProgress.total}…` : `Apply ${checkedKeys.size} Selected to Entra`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Directory table */}
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Full Directory</h2>
        <input
          type="text"
          placeholder="Search name, email, title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
      </div>

      {!directory ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
          Loading Entra directory…
        </p>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(22,48,43,0.1)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "#FAF8F2" }}>
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Job Title</th>
                <th className="px-3 py-2 text-left">Department</th>
                <th className="px-3 py-2 text-left">Office</th>
                <th className="px-3 py-2 text-left">Manager</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredDirectory.map((u) => {
                const edit = edits[u.id] ?? {};
                const hasEdit = Object.keys(edit).length > 0;
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid rgba(22,48,43,0.06)" }}>
                    <td className="px-3 py-2" style={{ fontWeight: 600 }}>
                      {u.displayName}
                    </td>
                    <td className="px-3 py-2" style={{ color: "rgba(22,48,43,0.5)" }}>
                      {u.mail ?? u.userPrincipalName}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        style={inputStyle}
                        value={edit.jobTitle ?? u.jobTitle ?? ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [u.id]: { ...prev[u.id], jobTitle: e.target.value } }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        style={inputStyle}
                        value={edit.department ?? u.department ?? ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [u.id]: { ...prev[u.id], department: e.target.value } }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        style={inputStyle}
                        value={edit.officeLocation ?? u.officeLocation ?? ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [u.id]: { ...prev[u.id], officeLocation: e.target.value } }))}
                      />
                    </td>
                    <td className="px-3 py-2" style={{ color: "rgba(22,48,43,0.5)" }}>
                      {u.managerDisplayName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {hasEdit && (
                        <button
                          onClick={() => saveRow(u.id)}
                          disabled={savingId === u.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md"
                          style={{ background: "var(--icna-green, #2F6D46)", color: "#fff" }}
                        >
                          {savingId === u.id ? "Saving…" : "Save"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
