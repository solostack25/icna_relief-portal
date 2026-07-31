"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string; state: string | null };
type Region = { region: string; rsn: number };

export default function OfficeAssignmentEditor({
  employeeId,
  offices,
  regions,
  currentOfficeId,
  currentRegion,
  currentRole,
}: {
  employeeId: string;
  offices: Office[];
  regions: Region[];
  currentOfficeId: string | null;
  currentRegion: string | null;
  currentRole: string;
}) {
  const supabase = createClient();
  const [role, setRole] = useState(currentRole);
  const [officeId, setOfficeId] = useState(currentOfficeId ?? "");
  const [region, setRegion] = useState(currentRegion ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    const { error } = await supabase
      .from("employees")
      .update({
        role,
        assigned_office_id: role === "staff" ? officeId || null : null,
        assigned_region: role === "regional_director" ? region || null : null,
      })
      .eq("id", employeeId);

    setSaving(false);
    setSaveMsg(error ? "Failed to update." : "Updated.");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
      <h2 className="text-sm font-medium">Role & Assignment</h2>

      <div>
        <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          <option value="staff">Staff</option>
          <option value="regional_director">Regional Director</option>
          <option value="program_director">Program Director</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {role === "staff" && (
        <div>
          <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
            Office (can only submit reports for this office)
          </label>
          <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} className={inputClass}>
            <option value="">Select an office...</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.region} — {o.field_office}
                {o.state ? ` (${o.state})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {role === "regional_director" && (
        <div>
          <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
            Region (sees & reviews every office in this region)
          </label>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass}>
            <option value="">Select a region...</option>
            {regions.map((r) => (
              <option key={r.region} value={r.region}>
                {r.region}
              </option>
            ))}
          </select>
        </div>
      )}

      {role === "program_director" && (
        <p className="text-xs text-[var(--color-text-dim)]">
          Program scope is set below via App Access — whichever program(s)
          are checked determine what they can see and review, across every
          office and region.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-[var(--color-accent)] text-black text-sm font-medium px-4 py-2 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      {saveMsg && <p className="text-sm text-[var(--color-text-dim)] mt-2">{saveMsg}</p>}
    </section>
  );
}
