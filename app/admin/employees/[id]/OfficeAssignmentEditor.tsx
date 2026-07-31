"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string; state: string | null };

export default function OfficeAssignmentEditor({
  employeeId,
  offices,
  currentOfficeId,
}: {
  employeeId: string;
  offices: Office[];
  currentOfficeId: string | null;
}) {
  const supabase = createClient();
  const [officeId, setOfficeId] = useState(currentOfficeId ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    const { error } = await supabase
      .from("employees")
      .update({ assigned_office_id: officeId || null })
      .eq("id", employeeId);

    setSaving(false);
    setSaveMsg(error ? "Failed to update." : "Assignment updated.");
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-sm font-medium mb-1">Office / State / Region</h2>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Reports this person creates in B2S, F.A.T.E., or D.R.S. will
        automatically use this office instead of asking them to pick one.
      </p>

      <select
        value={officeId}
        onChange={(e) => setOfficeId(e.target.value)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] mb-4"
      >
        <option value="">No assignment (e.g. HQ / reviewer)</option>
        {offices.map((o) => (
          <option key={o.id} value={o.id}>
            {o.region} — {o.field_office}
            {o.state ? ` (${o.state})` : ""}
          </option>
        ))}
      </select>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-[var(--color-accent)] text-black text-sm font-medium px-4 py-2 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save assignment"}
      </button>
      {saveMsg && (
        <p className="text-sm text-[var(--color-text-dim)] mt-2">{saveMsg}</p>
      )}
    </section>
  );
}
