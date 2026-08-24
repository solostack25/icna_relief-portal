"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Row = {
  email: string;
  displayName: string;
  matchedGroup: string;
  wouldBeRole: string;
  wouldBeOfficeId: string | null;
  wouldBeRegion: string | null;
  programSlugs: string[];
  status: "already_provisioned" | "would_provision" | "role_would_change";
  currentRole: string | null;
};

type PreviewData = {
  rows: Row[];
  unmappedExisting: { email: string; currentRole: string }[];
  groupErrors: { ad_group_name: string; ad_group_id: string; error: string }[];
  mappingCount: number;
};

const statusLabel: Record<Row["status"], string> = {
  already_provisioned: "Already provisioned",
  would_provision: "Would provision on first login",
  role_would_change: "Provisioned, but role/office differs from mapping",
};

const statusColor: Record<Row["status"], { fg: string; bg: string }> = {
  already_provisioned: { fg: "var(--portal-emerald, #2F6D46)", bg: "#EAF5EE" },
  would_provision: { fg: "#3E7FBF", bg: "#E9F1FA" },
  role_would_change: { fg: "#A57420", bg: "#FCEFDD" },
};

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  boxShadow: "0 3px 12px rgba(22,48,43,0.06)",
};

export default function AdPreviewPage() {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offices, setOffices] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const { data: officeRows } = await supabase.from("b2s_offices").select("id, field_office");
      setOffices(Object.fromEntries((officeRows ?? []).map((o) => [o.id, o.field_office])));

      const res = await fetch("/api/admin/ad-preview");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Request failed (${res.status})`);
        setLoading(false);
        return;
      }
      setData(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  const roleOptions = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.wouldBeRole))].sort(), [data]);
  const officeOptions = useMemo(() => {
    const labels = (data?.rows ?? [])
      .map((r) => (r.wouldBeOfficeId ? offices[r.wouldBeOfficeId] ?? r.wouldBeOfficeId : r.wouldBeRegion))
      .filter((v): v is string => !!v);
    return [...new Set(labels)].sort();
  }, [data, offices]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      const officeLabel = r.wouldBeOfficeId ? offices[r.wouldBeOfficeId] ?? r.wouldBeOfficeId : r.wouldBeRegion ?? "";
      if (roleFilter && r.wouldBeRole !== roleFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (officeFilter && officeLabel !== officeFilter) return false;
      if (q) {
        const haystack = `${r.displayName} ${r.email} ${r.matchedGroup}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, roleFilter, statusFilter, officeFilter, offices]);

  const hasActiveFilters = !!(search || roleFilter || statusFilter || officeFilter);

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 8px" }}>
        AD Provisioning Preview
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Read-only. Shows exactly who would be provisioned, and with what role/office, the moment
        they log in — nothing here writes to the database or creates any accounts.
      </p>

      {loading && (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
          Loading from Microsoft Graph…
        </p>
      )}
      {error && (
        <div className="rounded-2xl text-sm p-4 mb-6" style={{ background: "#FBE9EC", color: "#B5566B" }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {data.mappingCount === 0 && (
            <div className="rounded-2xl text-sm p-4 mb-6" style={{ background: "#FCEFDD", color: "#A57420" }}>
              No AD role mappings exist yet — nobody outside a mapped group can be provisioned.
              Add mappings at{" "}
              <Link href="/admin/ad-mappings" className="underline font-semibold">
                AD Mappings
              </Link>
              .
            </div>
          )}

          {data.groupErrors.length > 0 && (
            <div className="rounded-2xl text-sm p-4 mb-6" style={{ background: "#FBE9EC", color: "#B5566B" }}>
              <p className="font-semibold mb-1">
                Couldn&apos;t read {data.groupErrors.length} group{data.groupErrors.length === 1 ? "" : "s"} from Graph:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {data.groupErrors.map((g) => (
                  <li key={g.ad_group_id}>
                    {g.ad_group_name} — {g.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search name, email, or AD group…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, flex: "1 1 240px" }}
            />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={inputStyle}>
              <option value="">All roles</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} style={inputStyle}>
              <option value="">All offices/regions</option>
              {officeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
              <option value="">All statuses</option>
              {(Object.keys(statusLabel) as Row["status"][]).map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setRoleFilter("");
                  setStatusFilter("");
                  setOfficeFilter("");
                }}
                className="text-sm font-semibold"
                style={{ color: "rgba(22,48,43,0.45)" }}
              >
                Clear filters
              </button>
            )}
          </div>

          <p className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.4)" }}>
            {filteredRows.length} of {data.rows.length}
          </p>

          <div style={{ ...cardStyle, overflow: "hidden" }} className="mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--portal-line, rgba(22,48,43,0.08))" }}>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Email
                  </th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                    AD Group
                  </th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Would-be Role
                  </th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Office / Region
                  </th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => (
                  <tr key={r.email} style={{ borderBottom: i < filteredRows.length - 1 ? "1px solid var(--portal-line, rgba(22,48,43,0.06))" : "none" }}>
                    <td className="px-4 py-3" style={{ fontWeight: 600 }}>
                      {r.displayName}
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(22,48,43,0.55)" }}>
                      {r.email}
                    </td>
                    <td className="px-4 py-3">{r.matchedGroup}</td>
                    <td className="px-4 py-3">{r.wouldBeRole}</td>
                    <td className="px-4 py-3">
                      {r.wouldBeOfficeId ? offices[r.wouldBeOfficeId] ?? r.wouldBeOfficeId : r.wouldBeRegion ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{ color: statusColor[r.status].fg, background: statusColor[r.status].bg }}
                      >
                        {statusLabel[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
                      {data.rows.length === 0 ? "No AD group members found across the current mappings." : "No rows match these filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.unmappedExisting.length > 0 && (
            <div style={{ ...cardStyle, padding: "22px 24px" }}>
              <h2 className="text-sm font-bold mb-2" style={{ color: "#2F4A3E" }}>
                Provisioned but not covered by any current mapping
              </h2>
              <p className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.5)" }}>
                These employees exist in the portal already, but aren&apos;t in any AD group
                that&apos;s mapped right now — if their access is manually managed, that&apos;s fine;
                otherwise their role/office won&apos;t update from AD changes going forward.
              </p>
              <ul className="text-sm space-y-1">
                {data.unmappedExisting.map((e) => (
                  <li key={e.email} style={{ color: "rgba(22,48,43,0.55)" }}>
                    {e.email} — currently {e.currentRole}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
