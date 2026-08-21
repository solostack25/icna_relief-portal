"use client";

import { useEffect, useState } from "react";

type Approver = { id: string; full_name: string; email: string };

export default function CioApproversManager() {
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/cio-approvers");
    const body = await res.json();
    if (res.ok) setApprovers(body.approvers);
  }
  useEffect(() => {
    load();
  }, []);

  async function addApprover(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/cio-approvers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), is_cio: true }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(body.error);
      return;
    }
    setEmail("");
    load();
  }

  async function removeApprover(approverEmail: string) {
    await fetch("/api/admin/cio-approvers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: approverEmail, is_cio: false }),
    });
    load();
  }

  return (
    <div>
      {approvers.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {approvers.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
              <span>
                {a.full_name} <span className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>({a.email})</span>
              </span>
              <button onClick={() => removeApprover(a.email)} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm mb-3" style={{ color: "rgba(22,48,43,0.6)" }}>
          No approvers designated yet — until one is added, only Portal Admins can approve fundraisers.
        </p>
      )}
      <form onSubmit={addApprover} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="approver@icnarelief.org"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="text-sm rounded-lg bg-[var(--color-accent)] text-white px-4 py-2 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
