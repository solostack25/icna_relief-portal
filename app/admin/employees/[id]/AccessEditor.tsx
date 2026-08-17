"use client";

import { useState } from "react";

type App = { slug: string; display_name: string };

export default function AccessEditor({
  employeeId,
  authUserId,
  allApps,
  grantedSlugs,
}: {
  employeeId: string;
  authUserId: string;
  allApps: App[];
  grantedSlugs: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(grantedSlugs)
  );
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelected(next);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    const res = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        programSlugs: Array.from(selected),
      }),
    });

    setSaving(false);
    setSaveMsg(res.ok ? "Access updated." : "Failed to update access.");
  }

  async function handleResetPassword() {
    setResetting(true);
    setResetMsg(null);

    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authUserId }),
    });

    setResetting(false);
    const data = await res.json();
    setResetMsg(
      res.ok
        ? "Password reset email sent."
        : data.error ?? "Failed to send reset email."
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-sm font-medium mb-1">Marketing admin access</h2>
        <p className="text-xs text-[var(--color-text-dim)] mb-4">
          Grants the Contacts, Segments, Email Campaigns, SMS Campaigns, Sequences, and Donor Calling
          section in the Admin Portal sidebar, plus the &quot;Contacts &amp; Campaigns&quot; tile on the app launcher.
        </p>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has("marketing-contacts")}
            onChange={() => toggle("marketing-contacts")}
            className="accent-[var(--color-accent)]"
          />
          Marketing & Campaigns admin
        </label>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save access"}
        </button>
        {saveMsg && (
          <p className="text-sm text-[var(--color-text-dim)] mt-2">
            {saveMsg}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-sm font-medium mb-4">App access</h2>
        <div className="space-y-2">
          {allApps
            .filter((app) => app.slug !== "marketing-contacts")
            .map((app) => (
              <label
                key={app.slug}
                className="flex items-center gap-3 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(app.slug)}
                  onChange={() => toggle(app.slug)}
                  className="accent-[var(--color-accent)]"
                />
                {app.display_name}
              </label>
            ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save access"}
        </button>
        {saveMsg && (
          <p className="text-sm text-[var(--color-text-dim)] mt-2">
            {saveMsg}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-sm font-medium mb-4">Password</h2>
        <button
          onClick={handleResetPassword}
          disabled={resetting}
          className="rounded-lg border border-[var(--color-border)] text-sm px-4 py-2 hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {resetting ? "Sending..." : "Send password reset email"}
        </button>
        {resetMsg && (
          <p className="text-sm text-[var(--color-text-dim)] mt-2">
            {resetMsg}
          </p>
        )}
      </section>
    </div>
  );
}
