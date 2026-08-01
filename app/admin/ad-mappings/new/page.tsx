"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string };
type App = { slug: string; display_name: string };

export default function NewAdMappingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [offices, setOffices] = useState<Office[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    ad_group_id: "",
    ad_group_name: "",
    portal_role: "staff",
    assigned_office_id: "",
    assigned_region: "",
  });
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [regions, setRegions] = useState<{ region: string }[]>([]);

  useEffect(() => {
    supabase
      .from("b2s_offices")
      .select("id, region, field_office")
      .eq("is_active", true)
      .order("region")
      .then(({ data }) => setOffices(data ?? []));

    supabase
      .from("b2s_regions")
      .select("region")
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

    if (!form.ad_group_id || !form.ad_group_name) {
      setError("AD Group ID and name are required.");
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase.from("ad_role_mappings").insert({
      ad_group_id: form.ad_group_id,
      ad_group_name: form.ad_group_name,
      portal_role: form.portal_role,
      assigned_office_id: form.portal_role === "staff" ? form.assigned_office_id || null : null,
      assigned_region: form.portal_role === "regional_director" ? form.assigned_region || null : null,
      program_slugs: Array.from(selectedApps),
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/admin/ad-mappings");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">Add AD Role Mapping</h1>
          <Link
            href="/admin/ad-mappings"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">AD Security Group</h2>
            <p className="text-xs text-[var(--color-text-dim)]">
              Find the Group's Object ID in Azure Portal → Microsoft Entra ID → Groups → (your group) → Object ID.
            </p>
            <div>
              <label className={labelClass}>Group Object ID *</label>
              <input
                required
                value={form.ad_group_id}
                onChange={(e) => setForm((f) => ({ ...f, ad_group_id: e.target.value }))}
                className={inputClass}
                placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
              />
            </div>
            <div>
              <label className={labelClass}>Group Name (for display) *</label>
              <input
                required
                value={form.ad_group_name}
                onChange={(e) => setForm((f) => ({ ...f, ad_group_name: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Portal-RegionalDirector-Southeast"
              />
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">What This Grants</h2>
            <div>
              <label className={labelClass}>Portal Role</label>
              <select
                value={form.portal_role}
                onChange={(e) => setForm((f) => ({ ...f, portal_role: e.target.value }))}
                className={inputClass}
              >
                <option value="staff">Staff</option>
                <option value="regional_director">Regional Director</option>
                <option value="program_director">Program Director</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {form.portal_role === "staff" && (
              <div>
                <label className={labelClass}>Office</label>
                <select
                  value={form.assigned_office_id}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_office_id: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select an office...</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.region} — {o.field_office}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.portal_role === "regional_director" && (
              <div>
                <label className={labelClass}>Region</label>
                <select
                  value={form.assigned_region}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_region: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select a region...</option>
                  {regions.map((r) => (
                    <option key={r.region} value={r.region}>
                      {r.region}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={labelClass}>App Access</label>
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
            </div>
          </section>

          {error && <p className="text-sm text-[#B55139]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Mapping"}
          </button>
        </form>
      </div>
    </main>
  );
}
