"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string; state: string | null };
type App = { slug: string; display_name: string };
type Region = { region: string; rsn: number };
type EntraUser = { id: string; displayName: string; mail: string | null; userPrincipalName: string; jobTitle: string | null };

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";

function NewEmployeeForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [offices, setOffices] = useState<Office[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [directory, setDirectory] = useState<EntraUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [linkedAdUser, setLinkedAdUser] = useState<EntraUser | null>(null);
  const [adSearch, setAdSearch] = useState("");

  const [form, setForm] = useState({
    firstName: searchParams.get("firstName") ?? "",
    lastName: searchParams.get("lastName") ?? "",
    email: searchParams.get("email") ?? "",
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

    fetch("/api/admin/entra-directory")
      .then((r) => r.json())
      .then((body) => setDirectory(body.users ?? []))
      .catch(() => setDirectory([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If we arrived from step 1 with a specific Entra user id, use it
  // directly once the directory has loaded. Otherwise fall back to
  // matching by email, for when this page is opened without that
  // context (e.g. linking an existing pre-portal Entra account).
  useEffect(() => {
    if (linkedAdUser || directory.length === 0) return;
    const adUserId = searchParams.get("adUserId");
    if (adUserId) {
      const byId = directory.find((u) => u.id === adUserId);
      if (byId) {
        setLinkedAdUser(byId);
        return;
      }
    }
    if (form.email) {
      const byEmail = directory.find((u) => (u.mail ?? u.userPrincipalName)?.toLowerCase() === form.email.toLowerCase());
      if (byEmail) setLinkedAdUser(byEmail);
    }
  }, [directory, form.email, linkedAdUser, searchParams]);

  function toggleApp(slug: string) {
    const next = new Set(selectedApps);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelectedApps(next);
  }

  const adMatches = adSearch.trim().length > 1 ? directory.filter((u) => u.displayName.toLowerCase().includes(adSearch.toLowerCase())).slice(0, 6) : [];

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
        adObjectId: linkedAdUser?.id || null,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create employee.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-8">
          {form.firstName} {form.lastName} — Portal Access Set Up
        </h1>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-500/10 text-green-700 inline-block">
            Portal account created — invite email sent to {form.email}
          </span>
          {linkedAdUser && (
            <p className="text-sm text-[var(--color-text-dim)]">
              Linked to Entra account: {linkedAdUser.displayName} ({linkedAdUser.mail ?? linkedAdUser.userPrincipalName})
            </p>
          )}
          <button
            onClick={() => router.push("/admin")}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm mt-2"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Set Up Portal Access</h1>
      <p className="text-sm text-[var(--color-text-dim)] mb-8">
        Step 2 of 2 — this is portal role and access only. Their Entra ID account should already exist (see{" "}
        <a href="/admin/entra-directory/new" className="underline">
          Onboard New Employee
        </a>{" "}
        if it doesn&apos;t yet).
      </p>

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
            <p className="text-xs text-[var(--color-text-dim)] mt-1">They&apos;ll get an email invite to set their portal password.</p>
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputClass}>
              <option value="staff">Staff</option>
              <option value="area_manager">Area Manager</option>
              <option value="regional_director">Regional Director</option>
              <option value="program_director">Program Director</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3">
          <h2 className="text-sm font-medium">Linked Entra Account</h2>
          <p className="text-xs text-[var(--color-text-dim)]">
            Links this portal record to their real Entra ID account (auto-matched by email if it already exists). Optional, but
            needed for anything that syncs back to Entra later.
          </p>
          {linkedAdUser ? (
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
              <span className="text-sm">
                {linkedAdUser.displayName} <span className="text-[var(--color-text-dim)]">{linkedAdUser.mail}</span>
              </span>
              <button type="button" onClick={() => setLinkedAdUser(null)} className="text-xs text-[var(--color-text-dim)]">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={adSearch}
                onChange={(e) => setAdSearch(e.target.value)}
                placeholder="Search Entra directory by name…"
                className={inputClass}
              />
              {adMatches.length > 0 && (
                <div className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden border border-[var(--color-border)] bg-white">
                  {adMatches.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => {
                        setLinkedAdUser(u);
                        setAdSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm border-t border-[var(--color-border)] first:border-t-0"
                    >
                      {u.displayName} <span className="text-[var(--color-text-dim)]">{u.mail}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {form.role === "staff" || form.role === "area_manager" ? (
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Office / State Assignment</h2>
            <p className="text-xs text-[var(--color-text-dim)]">
              This person can only submit reports for this office — enforced at the database level, not just hidden in the UI.
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
        ) : null}

        {form.role === "regional_director" && (
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Region Assignment</h2>
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

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
          <h2 className="text-sm font-medium">App Access</h2>
          <div className="space-y-2">
            {apps.map((app) => (
              <label key={app.slug} className="flex items-center gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={selectedApps.has(app.slug)} onChange={() => toggleApp(app.slug)} className="accent-[var(--color-accent)]" />
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
          {saving ? "Setting up..." : "Set Up Portal Access & Send Invite"}
        </button>
      </form>
    </div>
  );
}

export default function NewEmployeePage() {
  return (
    <Suspense fallback={null}>
      <NewEmployeeForm />
    </Suspense>
  );
}
