"use client";

import { useEffect, useState } from "react";
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

const statusColor: Record<Row["status"], string> = {
  already_provisioned: "text-green-700 bg-green-50",
  would_provision: "text-blue-700 bg-blue-50",
  role_would_change: "text-amber-700 bg-amber-50",
};

export default function AdPreviewPage() {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offices, setOffices] = useState<Record<string, string>>({});

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

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">AD Provisioning Preview</h1>
          <Link href="/admin" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back to Admin Portal
          </Link>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] mb-8">
          Read-only. Shows exactly who would be provisioned, and with what role/office, the moment
          they log in — nothing here writes to the database or creates any accounts.
        </p>

        {loading && <p className="text-sm text-[var(--color-text-dim)]">Loading from Microsoft Graph…</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4 mb-6">
            {error}
          </div>
        )}

        {data && (
          <>
            {data.mappingCount === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm p-4 mb-6">
                No AD role mappings exist yet — nobody outside a mapped group can be provisioned.
                Add mappings at{" "}
                <Link href="/admin/ad-mappings" className="underline">
                  AD Mappings
                </Link>
                .
              </div>
            )}

            {data.groupErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4 mb-6">
                <p className="font-medium mb-1">
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

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-dim)]">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">AD Group</th>
                    <th className="px-4 py-3 font-medium">Would-be Role</th>
                    <th className="px-4 py-3 font-medium">Office / Region</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.email} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3">{r.displayName}</td>
                      <td className="px-4 py-3 text-[var(--color-text-dim)]">{r.email}</td>
                      <td className="px-4 py-3">{r.matchedGroup}</td>
                      <td className="px-4 py-3">{r.wouldBeRole}</td>
                      <td className="px-4 py-3">
                        {r.wouldBeOfficeId ? offices[r.wouldBeOfficeId] ?? r.wouldBeOfficeId : r.wouldBeRegion ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusColor[r.status]}`}>
                          {statusLabel[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-text-dim)]">
                        No AD group members found across the current mappings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {data.unmappedExisting.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2">
                  Provisioned but not covered by any current mapping
                </h2>
                <p className="text-xs text-[var(--color-text-dim)] mb-3">
                  These employees exist in the portal already, but aren&apos;t in any AD group
                  that&apos;s mapped right now — if their access is manually managed, that&apos;s fine;
                  otherwise their role/office won&apos;t update from AD changes going forward.
                </p>
                <ul className="text-sm space-y-1">
                  {data.unmappedExisting.map((e) => (
                    <li key={e.email} className="text-[var(--color-text-dim)]">
                      {e.email} — currently {e.currentRole}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
