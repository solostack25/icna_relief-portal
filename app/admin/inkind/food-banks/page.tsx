"use client";

import { useEffect, useMemo, useState } from "react";

type Office = { id: string; name: string; state: string };
type Grant = { id: string; code: string; name: string; office_id: string | null; status: string; lines: { id: string; label: string }[] };
type Employee = { id: string; name: string; office_id: string | null };
type Mapping = { ref: string; gm_grant_id: string; gm_line_id: string | null };
type Profile = {
  id?: string;
  office_id: string;
  name: string;
  aliases: string[];
  inkind_rule: "all_lines" | "zero_cost_only";
  track_charges: boolean;
  ticket_requestor_id: string | null;
  grant_mappings: Mapping[];
  notes: string | null;
  is_active: boolean;
};

const blank = (officeId: string): Profile => ({
  office_id: officeId,
  name: "",
  aliases: [],
  inkind_rule: "all_lines",
  track_charges: false,
  ticket_requestor_id: null,
  grant_mappings: [],
  notes: null,
  is_active: true,
});

export default function FoodBanksPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [aliasText, setAliasText] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/inkind-admin/food-banks");
    const d = await res.json().catch(() => ({ error: "Couldn't load" }));
    if (!res.ok) setError(d.error ?? "Couldn't load");
    else {
      setOffices(d.offices);
      setProfiles(d.profiles);
      setGrants(d.grants);
      setEmployees(d.employees);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const officeName = (id: string) => offices.find((o) => o.id === id)?.name ?? "—";

  function open(p: Profile) {
    setEditing({ ...p, grant_mappings: [...(p.grant_mappings ?? [])] });
    setAliasText((p.aliases ?? []).join(", "));
    setError(null);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/inkind-admin/food-banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editing, aliases: aliasText.split(",").map((a) => a.trim()).filter(Boolean) }),
    });
    const d = await res.json().catch(() => ({ error: "Save failed" }));
    setSaving(false);
    if (!res.ok) return setError(d.error ?? "Save failed");
    setEditing(null);
    load();
  }

  const officeGrants = useMemo(
    () => (editing ? [...grants].sort((a, b) => Number(b.office_id === editing.office_id) - Number(a.office_id === editing.office_id)) : []),
    [grants, editing]
  );
  const officeEmployees = useMemo(
    () => (editing ? [...employees].sort((a, b) => Number(b.office_id === editing.office_id) - Number(a.office_id === editing.office_id)) : []),
    [employees, editing]
  );

  function setMapping(i: number, patch: Partial<Mapping>) {
    if (!editing) return;
    const next = editing.grant_mappings.map((m, j) => (j === i ? { ...m, ...patch } : m));
    setEditing({ ...editing, grant_mappings: next });
  }

  if (loading) return <main className="p-6"><p className="text-gray-400 text-sm">Loading...</p></main>;

  return (
    <main className="p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark mb-1">Food Banks</h1>
          <p className="text-gray-500 text-sm max-w-2xl">
            How each office&apos;s food bank invoices get split at Food Bank Delivery intake. Offices without a profile
            treat every line as in-kind with nothing billed.
          </p>
        </div>
        {offices.length > 0 && !editing && (
          <button onClick={() => open(blank(offices[0].id))} className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-white shrink-0">
            + Add food bank
          </button>
        )}
      </div>

      {error && !editing && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {!editing && (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {profiles.length === 0 && <p className="p-6 text-sm text-gray-400 text-center">No food bank profiles yet.</p>}
          {profiles.map((p) => (
            <button key={p.id} onClick={() => open(p)} className="w-full text-left p-4 hover:bg-gray-50 flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-800">
                  {p.name} {!p.is_active && <span className="text-xs text-gray-400">(inactive)</span>}
                </p>
                <p className="text-xs text-gray-500">{officeName(p.office_id)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {p.inkind_rule === "zero_cost_only" ? "Only $0-cost lines are in-kind" : "Every line is in-kind"}
                  {p.track_charges && " · charges posted (grant credit → Grant Management, amount owed → Vendor Payment ticket)"}
                </p>
              </div>
              {p.track_charges && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {p.grant_mappings.length} grant mapping{p.grant_mappings.length === 1 ? "" : "s"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">Office</label>
              <select
                value={editing.office_id}
                onChange={(e) => setEditing({ ...editing, office_id: e.target.value })}
                className="w-full mt-1 rounded-lg border border-gray-300 p-2.5 bg-white"
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.state} – {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">Food bank name</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Second Harvest Food Bank of Central Florida"
                className="w-full mt-1 rounded-lg border border-gray-300 p-2.5"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-600">Other names it prints (comma separated)</label>
            <input value={aliasText} onChange={(e) => setAliasText(e.target.value)} className="w-full mt-1 rounded-lg border border-gray-300 p-2.5" />
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">What counts as in-kind</p>
            {(
              [
                ["all_lines", "Every line on the invoice", "Everything received is donated (e.g. Houston)."],
                ["zero_cost_only", "Only lines with $0 product cost", "Purchased lines are left out of in-kind (e.g. Second Harvest's Purchase Food). Shared-maintenance fees don't make a line purchased."],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className="flex items-start gap-2 mb-2 text-sm">
                <input type="radio" checked={editing.inkind_rule === v} onChange={() => setEditing({ ...editing, inkind_rule: v })} className="mt-1" />
                <span>
                  <span className="font-medium text-gray-800">{label}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={editing.track_charges} onChange={(e) => setEditing({ ...editing, track_charges: e.target.checked })} className="mt-1" />
              <span>
                <span className="font-medium text-gray-800">This food bank bills us</span>
                <span className="block text-xs text-gray-500">
                  Grant credits printed on the invoice post to the mapped grant in Grant Management (auto-approved, invoice
                  attached). The Amount Owed opens a Vendor Payment finance ticket billed to the office.
                </span>
              </span>
            </label>

            {editing.track_charges && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm text-gray-600">Open Vendor Payment tickets under (when the intake is done signed out)</label>
                  <select
                    value={editing.ticket_requestor_id ?? ""}
                    onChange={(e) => setEditing({ ...editing, ticket_requestor_id: e.target.value || null })}
                    className="w-full mt-1 rounded-lg border border-gray-300 p-2.5 bg-white"
                  >
                    <option value="">— Signed-in staff only —</option>
                    {officeEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.office_id === editing.office_id ? "" : ` (${officeName(e.office_id ?? "")})`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Their manager chain approves the ticket, like any finance ticket.</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-1">Grant mappings</p>
                  <p className="text-xs text-gray-400 mb-2">
                    The grant number as the food bank prints it (e.g. <code>500889_31</code>) → the grant registered in Grant
                    Management. Credits for an unmapped grant wait on the InKind dashboard until it&apos;s mapped.
                  </p>
                  {editing.grant_mappings.map((m, i) => {
                    const g = grants.find((x) => x.id === m.gm_grant_id);
                    return (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_1.2fr_auto] gap-2 mb-2">
                        <input value={m.ref} onChange={(e) => setMapping(i, { ref: e.target.value })} placeholder="500889_31" className="rounded-lg border border-gray-300 p-2 text-sm" />
                        <select value={m.gm_grant_id} onChange={(e) => setMapping(i, { gm_grant_id: e.target.value, gm_line_id: null })} className="rounded-lg border border-gray-300 p-2 text-sm bg-white">
                          <option value="">Grant…</option>
                          {officeGrants.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.code} — {x.name}
                              {x.status !== "active" ? ` (${x.status})` : ""}
                            </option>
                          ))}
                        </select>
                        <select value={m.gm_line_id ?? ""} onChange={(e) => setMapping(i, { gm_line_id: e.target.value || null })} className="rounded-lg border border-gray-300 p-2 text-sm bg-white" disabled={!g}>
                          <option value="">Budget line: auto (food / supplies)</option>
                          {g?.lines.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setEditing({ ...editing, grant_mappings: editing.grant_mappings.filter((_, j) => j !== i) })}
                          className="text-gray-400 hover:text-red-600 px-2"
                          aria-label="Remove mapping"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setEditing({ ...editing, grant_mappings: [...editing.grant_mappings, { ref: "", gm_grant_id: "", gm_line_id: null }] })}
                    className="text-sm font-semibold text-brand-dark"
                  >
                    + Map a grant
                  </button>
                  {grants.length === 0 && (
                    <p className="text-xs text-amber-700 mt-2">No grants are registered in Grant Management yet. Register the food bank grant there first.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-600">Notes</label>
            <textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} className="w-full mt-1 rounded-lg border border-gray-300 p-2.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
            Active
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className="rounded-xl bg-brand px-6 py-2.5 font-semibold text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-xl bg-gray-100 px-6 py-2.5 font-semibold text-gray-700">
              Cancel
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
