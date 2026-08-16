"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ExtensionEditor({ employeeId, currentExtension }: { employeeId: string; currentExtension: string | null }) {
  const supabase = createClient();
  const [extension, setExtension] = useState(currentExtension ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase
      .from("employees")
      .update({ threecx_extension: extension.trim() || null })
      .eq("id", employeeId);
    setSaving(false);
    setSaveMsg(error ? "Failed to update." : "Updated.");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3">
      <h2 className="text-sm font-medium">3CX Extension</h2>
      <p className="text-xs text-[var(--color-text-dim)]">
        Powers click-to-call on client/donor profiles — calls originate from this extension.
      </p>
      <input
        className={inputClass}
        placeholder="e.g. 101"
        value={extension}
        onChange={(e) => setExtension(e.target.value)}
      />
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
