"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string; state: string | null };
type App = { slug: string; display_name: string };
type Region = { region: string; rsn: number };

export default function NewEmployeePage() {
  const supabase = createClient();
  const router = useRouter();

  const [offices, setOffices] = useState<Office[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "staff",
    assignedOfficeId: "",
    assignedRegion: "",
  });
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("b2s_offices")
      .select("id, region, field_office, state")
      .eq("is_active", true)
      .order("region")
      .then(({ data }) => setOffices(data ?? []));

    supabase
      .from("b2s_regions")
      .select("region, rsn")
      .order("rsn")
      .then(({ data }) => setRegions(data ?? []));

    supabase
      .from("app_registry")
      .select("slug, display_name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setApps(data ?? []));
  }, []);

  function toggleApp(slug: string) {
    const next = new Set(selectedApps);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelectedApps(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.firstName || !form.lastName || !form.email) {
      setError("First name, last name, and email are required.");
      return;
    }

    setSaving(true);

    const res = await fetch("/api/admin/employees/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role,
        assignedOfficeId: form.assignedOfficeId || null,
        assignedRegion: form.assignedRegion || null,
        programSlugs: Array.from(selectedApps),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create employee.");
      return;
    }

    router.push("/admin");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">Add Employee</h1>
          <Link
            href="/admin"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Admin
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First Name *</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
              />
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                They'll get an email invite to set their password.
              </p>
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className={inputClass}
              >
                <option value="staff">Staff</option>
                <option value="regional_director">Regional Director</option>
                <option value="program_director">Program Director</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </section>

          {form.role === "staff" && (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
              <h2 className="text-sm font-medium">Office / State Assignment</h2>
              <p className="text-xs text-[var(--color-text-dim)]">
                This person can only submit reports for this office —
                enforced at the database level, not just hidden in the UI.
              </p>
              <select
                value={form.assignedOfficeId}
                onChange={(e) => setForm((f) => ({ ...f, assignedOfficeId: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select an office...</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.region} — {o.field_office}
                    {o.state ? ` (${o.state})` : ""}
                  </option>
                ))}
              </select>
            </section>
          )}

          {form.role === "regional_director" && (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
              <h2 className="text-sm font-medium">Region Assignment</h2>
              <p className="text-xs text-[var(--color-text-dim)]">
                Sees and reviews every office's submissions within this
                region, across whichever programs they're granted below.
              </p>
              <select
                value={form.assignedRegion}
                onChange={(e) => setForm((f) => ({ ...f, assignedRegion: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select a region...</option>
                {regions.map((r) => (
                  <option key={r.region} value={r.region}>
                    {r.region}
                  </option>
                ))}
              </select>
            </section>
          )}

          {form.role === "program_director" && (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="text-sm font-medium mb-1">Program Scope</h2>
              <p className="text-xs text-[var(--color-text-dim)]">
                Sees and reviews every office/region's submissions, but only
                for the program(s) checked below.
              </p>
            </section>
          )}

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">App Access</h2>
            <div className="space-y-2">
              {apps.map((app) => (
                <label key={app.slug} className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedApps.has(app.slug)}
                    onChange={() => toggleApp(app.slug)}
                    className="accent-[var(--color-accent)]"
                  />
                  {app.display_name}
                </label>
              ))}
            </div>
          </section>

          {error && <p className="text-sm text-[#B55139]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Employee & Send Invite"}
          </button>
        </form>
      </div>
    </main>
  );
}
