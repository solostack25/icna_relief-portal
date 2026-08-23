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
        <ul className="mb-3 space-y-2">
          {approvers.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm rounded-2xl px-4 py-2.5" style={{ background: "#F4F3EE" }}>
              <span>
                <span style={{ fontWeight: 600 }}>{a.full_name}</span>{" "}
                <span className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                  ({a.email})
                </span>
              </span>
              <button onClick={() => removeApprover(a.email)} className="text-xs font-semibold hover:underline" style={{ color: "#B5566B" }}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm mb-3" style={{ color: "rgba(22,48,43,0.5)" }}>
          No approvers designated yet — until one is added, only Portal Admins can approve fundraisers.
        </p>
      )}
      <form onSubmit={addApprover} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="approver@icnarelief.org"
          className="flex-1 text-sm"
          style={{ border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))", borderRadius: 10, padding: "10px 14px", background: "#fff", outline: "none" }}
        />
        <button
          type="submit"
          disabled={saving}
          className="text-sm rounded-full text-white font-bold px-5 py-2.5 disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          Add
        </button>
      </form>
      {error && (
        <p className="text-xs mt-2" style={{ color: "#B5566B" }}>
          {error}
        </p>
      )}
    </div>
  );
}
