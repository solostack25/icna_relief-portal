"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { refreshPublicWebsiteSoon } from "@/lib/refreshPublicWebsiteClient";
import {
  VOLUNTEER_PROGRAMS,
  US_TIMEZONES,
  formatInTz,
  formatTimeInTz,
  utcIsoToZonedLocal,
  zonedLocalToUtcIso,
} from "@/lib/volunteer";

type EventDetails = {
  id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_address: string | null;
  program: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
};

export default function EventDetailsCard({ event }: { event: EventDetails }) {
  const supabase = createClient();
  const router = useRouter();
  const needsSetup = !event.program || !event.ends_at;
  const [editing, setEditing] = useState(needsSetup);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: event.title,
    description: event.description ?? "",
    location_name: event.location_name ?? "",
    location_address: event.location_address ?? "",
    program: event.program ?? "",
    starts_at: utcIsoToZonedLocal(event.starts_at, event.timezone),
    ends_at: utcIsoToZonedLocal(event.ends_at, event.timezone),
    timezone: event.timezone,
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError("Title is required.");
    if (!form.program) return setError("Choose a program.");
    if (!form.starts_at || !form.ends_at) return setError("Set a start and end time.");
    const startsAt = zonedLocalToUtcIso(form.starts_at, form.timezone);
    const endsAt = zonedLocalToUtcIso(form.ends_at, form.timezone);
    if (new Date(endsAt) <= new Date(startsAt)) return setError("The end time has to be after the start time.");

    setSaving(true);
    const { error } = await supabase
      .from("volunteer_events")
      .update({
        title: form.title.trim(),
        description: form.description || null,
        location_name: form.location_name || null,
        location_address: form.location_address || null,
        program: form.program,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: form.timezone,
        starts_on: form.starts_at.slice(0, 10),
        ends_on: form.ends_at.slice(0, 10),
      })
      .eq("id", event.id);
    setSaving(false);
    if (error) return setError(error.message);
    setEditing(false);
    refreshPublicWebsiteSoon();
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">Event details</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-sm text-[var(--color-accent)] font-medium">
            Edit
          </button>
        )}
      </div>

      {needsSetup && (
        <p className="mb-4 rounded-lg bg-[var(--color-accent-orange)]/10 px-3 py-2 text-xs text-[#7a5a17]">
          This event was created before check-in existed. Set its program and end time so hours are reported correctly
          and volunteers are checked out automatically.
        </p>
      )}

      {!editing ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-[var(--color-text-dim)]">Program</dt>
            <dd>{event.program ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-dim)]">When</dt>
            <dd>
              {event.starts_at ? formatInTz(event.starts_at, event.timezone, { weekday: "short" }) : "—"}
              {event.ends_at ? ` – ${formatTimeInTz(event.ends_at, event.timezone)}` : ""}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-[var(--color-text-dim)]">Automatic check-out</dt>
            <dd>
              {event.ends_at
                ? `${formatInTz(event.ends_at, event.timezone)} (${
                    US_TIMEZONES.find((z) => z.value === event.timezone)?.label ?? event.timezone
                  } time) — at this time each day for multi-day events`
                : "Not set"}
            </dd>
          </div>
        </dl>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className={labelClass}>Title *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Program *</label>
            <select value={form.program} onChange={(e) => set("program", e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              {VOLUNTEER_PROGRAMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Starts *</label>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Ends * (auto check-out)</label>
              <input type="datetime-local" value={form.ends_at} min={form.starts_at || undefined} onChange={(e) => set("ends_at", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Time zone</label>
            <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputClass}>
              {US_TIMEZONES.map((z) => (
                <option key={z.value} value={z.value}>{z.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Location name</label>
              <input value={form.location_name} onChange={(e) => set("location_name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input value={form.location_address} onChange={(e) => set("location_address", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
          </div>
          {error && <p className="text-sm text-[#B55139]">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50">
              {saving ? "Saving..." : "Save details"}
            </button>
            {!needsSetup && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[var(--color-border)] px-4 text-sm">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
