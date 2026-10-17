"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VOLUNTEER_PROGRAMS, US_TIMEZONES, guessOfficeTimezone, zonedLocalToUtcIso } from "@/lib/volunteer";

type Office = { id: string; region: string; field_office: string; state: string | null };

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "event"}-${suffix}`;
}

export default function NewVolunteerEventPage() {
  const supabase = createClient();
  const router = useRouter();

  const [offices, setOffices] = useState<Office[]>([]);
  const [assignedOffice, setAssignedOffice] = useState<Office | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    office_id: "",
    title: "",
    description: "",
    location_name: "",
    location_address: "",
    program: "",
    starts_at: "",
    ends_at: "",
    timezone: "America/Chicago",
  });

  useEffect(() => {
    supabase
      .from("b2s_offices")
      .select("id, region, field_office, state")
      .eq("is_active", true)
      .order("region")
      .then(({ data }) => setOffices(data ?? []));

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: me } = await supabase
        .from("employees")
        .select("assigned_office_id")
        .eq("auth_user_id", user.id)
        .single();

      if (me?.assigned_office_id) {
        const { data: office } = await supabase
          .from("b2s_offices")
          .select("id, region, field_office, state")
          .eq("id", me.assigned_office_id)
          .single();

        if (office) {
          setAssignedOffice(office);
          update("office_id", office.id);
          update("timezone", guessOfficeTimezone(office.state));
        }
      }
    })();
  }, []);

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.office_id) {
      setError("Please select an office.");
      return;
    }
    if (!form.title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (!form.program) {
      setError("Please choose the program this event supports.");
      return;
    }
    if (!form.starts_at || !form.ends_at) {
      setError("Please set when the event starts and ends — volunteers are checked out automatically at the end time.");
      return;
    }
    const startsAt = zonedLocalToUtcIso(form.starts_at, form.timezone);
    const endsAt = zonedLocalToUtcIso(form.ends_at, form.timezone);
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("The end time has to be after the start time.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: me } = await supabase
      .from("employees")
      .select("id")
      .eq("auth_user_id", user?.id)
      .single();

    const { data, error: insertError } = await supabase
      .from("volunteer_events")
      .insert({
        office_id: form.office_id,
        employee_id: me?.id,
        title: form.title.trim(),
        description: form.description || null,
        location_name: form.location_name || null,
        location_address: form.location_address || null,
        program: form.program,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: form.timezone,
        // Date-only columns still feed the WordPress widget + Copilot.
        starts_on: form.starts_at.slice(0, 10),
        ends_on: form.ends_at.slice(0, 10),
        slug: slugify(form.title),
        is_published: false,
      })
      .select("id")
      .single();

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push(`/volunteer/${data.id}`);
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">New Volunteer Event</h1>
          <Link
            href="/volunteer"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Details</h2>

            <div>
              <label className={labelClass}>Office *</label>
              {assignedOffice ? (
                <div className={inputClass + " flex items-center"}>
                  {assignedOffice.region} — {assignedOffice.field_office}
                </div>
              ) : (
                <select
                  required
                  value={form.office_id}
                  onChange={(e) => {
                    update("office_id", e.target.value);
                    const o = offices.find((x) => x.id === e.target.value);
                    if (o) update("timezone", guessOfficeTimezone(o.state));
                  }}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.region} — {o.field_office}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className={labelClass}>Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                className={inputClass}
                placeholder="e.g. Dallas Food Pantry — August Sort & Pack"
              />
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="What volunteers should know before signing up"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Location Name</label>
                <input
                  value={form.location_name}
                  onChange={(e) => update("location_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <input
                  value={form.location_address}
                  onChange={(e) => update("location_address", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Program *</label>
              <select
                required
                value={form.program}
                onChange={(e) => update("program", e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {VOLUNTEER_PROGRAMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Starts *</label>
                <input
                  required
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => {
                    update("starts_at", e.target.value);
                    if (!form.ends_at) update("ends_at", e.target.value);
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Ends *</label>
                <input
                  required
                  type="datetime-local"
                  value={form.ends_at}
                  min={form.starts_at || undefined}
                  onChange={(e) => update("ends_at", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className={labelClass}>Time zone</label>
                <select value={form.timezone} onChange={(e) => update("timezone", e.target.value)} className={inputClass}>
                  {US_TIMEZONES.map((z) => (
                    <option key={z.value} value={z.value}>{z.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-[var(--color-text-dim)] pb-2">
                Anyone still checked in at the end time is checked out automatically. For multi-day events, that happens at the end time each day.
              </p>
            </div>
          </section>

          {error && <p className="text-sm text-[#B55139]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Event & Add Slots"}
          </button>
        </form>
      </div>
    </main>
  );
}
