"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string };
type App = { slug: string; display_name: string };

// Determines which mapping wins during provisioning when someone
// belongs to multiple mapped AD groups (e.g. staff + admin). Higher
// wins. Keep in sync with app/admin/ad-mappings/new/page.tsx.
const ROLE_PRIORITY: Record<string, number> = {
  admin: 100,
  program_director: 75,
  regional_director: 50,
  area_manager: 25,
  staff: 0,
};

export default function EditAdMappingPage() {
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();
  const router = useRouter();

  const [offices, setOffices] = useState<Office[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [regions, setRegions] = useState<{ region: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    ad_group_id: "",
    ad_group_name: "",
    portal_role: "staff",
    assigned_office_id: "",
    assigned_region: "",
  });
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [{ data: mapping }, { data: officeData }, { data: regionData }, { data: appData }] =
        await Promise.all([
          supabase.from("ad_role_mappings").select("*").eq("id", id).single(),
          supabase
            .from("b2s_offices")
            .select("id, region, field_office")
            .eq("is_active", true)
            .order("region"),
          supabase.from("b2s_regions").select("region").order("rsn"),
          supabase
            .from("app_registry")
            .select("slug, display_name")
            .eq("is_active", true)
            .order("sort_order"),
        ]);

      if (mapping) {
        setForm({
          ad_group_id: mapping.ad_group_id ?? "",
          ad_group_name: mapping.ad_group_name ?? "",
          portal_role: mapping.portal_role ?? "staff",
          assigned_office_id: mapping.assigned_office_id ?? "",
          assigned_region: mapping.assigned_region ?? "",
        });
        setSelectedApps(new Set(mapping.program_slugs ?? []));
      }
      setOffices(officeData ?? []);
      setRegions(regionData ?? []);
      setApps(appData ?? []);
      setLoading(false);
    })();
  }, [id]);

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

    const { error: updateError } = await supabase
      .from("ad_role_mappings")
      .update({
        ad_group_id: form.ad_group_id,
        ad_group_name: form.ad_group_name,
        portal_role: form.portal_role,
        assigned_office_id: form.portal_role === "staff" || form.portal_role === "area_manager" ? form.assigned_office_id || null : null,
        assigned_region: form.portal_role === "regional_director" ? form.assigned_region || null : null,
        program_slugs: Array.from(selectedApps),
        priority: ROLE_PRIORITY[form.portal_role] ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/admin/ad-mappings");
  }

  async function handleDelete() {
    if (!confirm(`Delete the mapping for "${form.ad_group_name}"? This won't affect employees who already got access from it — it just stops the sync from managing them going forward.`)) {
      return;
    }

    setDeleting(true);
    const { error: deleteError } = await supabase
      .from("ad_role_mappings")
      .delete()
      .eq("id", id);

    setDeleting(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push("/admin/ad-mappings");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";

  if (loading) {
    return <div className="text-sm text-[var(--color-text-dim)]">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Edit AD Role Mapping</h1>
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
            <div>
              <label className={labelClass}>Group Object ID *</label>
              <input
                required
                value={form.ad_group_id}
                onChange={(e) => setForm((f) => ({ ...f, ad_group_id: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Group Name (for display) *</label>
              <input
                required
                value={form.ad_group_name}
                onChange={(e) => setForm((f) => ({ ...f, ad_group_name: e.target.value }))}
                className={inputClass}
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
                <option value="area_manager">Area Manager</option>
                <option value="regional_director">Regional Director</option>
                <option value="program_director">Program Director</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {(form.portal_role === "staff" || form.portal_role === "area_manager") && (
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
            {saving ? "Saving..." : "Save Changes"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="w-full rounded-lg border border-[#B55139]/40 text-[#B55139] font-medium py-3 text-sm hover:border-[#B55139] disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Mapping"}
          </button>
        </form>
    </div>
  );
}
