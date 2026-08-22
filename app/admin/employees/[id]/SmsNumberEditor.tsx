"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SmsNumberEditor({ employeeId, currentNumber }: { employeeId: string; currentNumber: string | null }) {
  const supabase = createClient();
  const [number, setNumber] = useState(currentNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase
      .from("employees")
      .update({ sms_number: number.trim() || null })
      .eq("id", employeeId);
    setSaving(false);
    setSaveMsg(error ? "Failed to update." : "Updated.");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3">
      <h2 className="text-sm font-medium">Personal SMS Number (Skyetel)</h2>
      <p className="text-xs text-[var(--color-text-dim)]">
        Must be a real DID already provisioned for SMS in Skyetel — this just tells the portal which number to
        send from for this employee. Texts sent via Quick Text or the Portal Assistant will use this number if
        set; if left blank, they fall back to the shared office line configured in Admin → Connectors.
      </p>
      <input className={inputClass} placeholder="e.g. (407) 555-0134" value={number} onChange={(e) => setNumber(e.target.value)} />
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs px-3 py-1.5 rounded bg-[var(--color-accent)] text-white font-medium disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      {saveMsg && <p className="text-xs text-[var(--color-text-dim)]">{saveMsg}</p>}
    </section>
  );
}
