"use client";

import { useEffect, useState } from "react";

type Person = { id: string; full_name: string; email: string };

export default function ZakatFinanceAccessManager() {
  const [people, setPeople] = useState<Person[]>([]);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/zakat-finance-access");
    const body = await res.json();
    if (res.ok) setPeople(body.approvers);
  }
  useEffect(() => {
    load();
  }, []);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/zakat-finance-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), is_zakat_finance: true }),
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

  async function revoke(personEmail: string) {
    await fetch("/api/admin/zakat-finance-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: personEmail, is_zakat_finance: false }),
    });
    load();
  }

  return (
    <div>
      {people.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm rounded-2xl px-4 py-2.5" style={{ background: "#F4F3EE" }}>
              <span>
                <span style={{ fontWeight: 600 }}>{p.full_name}</span>{" "}
                <span className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                  ({p.email})
                </span>
              </span>
              <button onClick={() => revoke(p.email)} className="text-xs font-semibold hover:underline" style={{ color: "#B5566B" }}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm mb-3" style={{ color: "rgba(22,48,43,0.5)" }}>
          Only Portal Admins can see the Approved Applications queue until someone is added here. Must already be a portal
          employee.
        </p>
      )}
      <form onSubmit={grant} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="finance@icnarelief.org"
          className="flex-1 text-sm"
          style={{ border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))", borderRadius: 10, padding: "10px 14px", background: "#fff", outline: "none" }}
        />
        <button
          type="submit"
          disabled={saving}
          className="text-sm rounded-full text-white font-bold px-5 py-2.5 disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          Grant Access
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
