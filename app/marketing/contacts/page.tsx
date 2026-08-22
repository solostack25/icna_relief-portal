"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Contact = {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email_opt_out: boolean;
  sms_opt_out: boolean;
  source: string;
  created_at: string;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    const res = await fetch(`/api/marketing/contacts?${params}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [q, tag, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-gray-500">{total.toLocaleString()} total</p>
        </div>
        <Link
          href="/marketing/contacts/import"
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium"
        >
          Import CSV
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name, email, phone..."
          className="border rounded px-3 py-2 text-sm flex-1 min-w-0"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <input
          type="text"
          placeholder="Filter by tag (e.g. top_donor)"
          className="border rounded px-3 py-2 text-sm w-full sm:w-64"
          value={tag}
          onChange={(e) => {
            setPage(1);
            setTag(e.target.value.trim().toLowerCase().replace(/\s+/g, "_"));
          }}
        />
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Opt-outs</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  No contacts found.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-3 py-2">{c.email ?? "—"}</td>
                  <td className="px-3 py-2">{c.phone ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-400">{c.source}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.email_opt_out && <span className="text-amber-600 mr-2">email</span>}
                    {c.sms_opt_out && <span className="text-amber-600">sms</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1 border rounded disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-gray-500">Page {page}</span>
        <button
          disabled={page * 50 >= total}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 border rounded disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
