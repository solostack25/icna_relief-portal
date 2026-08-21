"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string };

const FREQUENCY_OPTIONS = ["ONE_TIME", "MONTHLY", "QUARTERLY", "ANNUALLY"];

export default function NewFundraiserPage() {
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
    form_type: "fundraising" as "fundraising" | "event",
    funds: "", // comma-separated in the UI, split on submit
    frequencies: ["ONE_TIME"] as string[],
    color: "#10B981",
    header_image: "",
    story: "",
    goal: "",
    event_date: "",
    start_time: "",
    end_time: "",
    location: "",
  });

  useEffect(() => {
    supabase
      .from("b2s_offices")
      .select("id, region, field_office")
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
          .select("id, region, field_office")
          .eq("id", me.assigned_office_id)
          .single();

        if (office) {
          setAssignedOffice(office);
          update("office_id", office.id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleFrequency(freq: string) {
    setForm((f) => ({
      ...f,
      frequencies: f.frequencies.includes(freq)
        ? f.frequencies.filter((x) => x !== freq)
        : [...f.frequencies, freq],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.office_id) return setError("Please select an office.");
    if (!form.title.trim()) return setError("Please enter a title.");
    const funds = form.funds.split(",").map((f) => f.trim()).filter(Boolean);
    if (funds.length === 0) return setError("Enter at least one fund (comma-separated).");
    if (form.form_type === "fundraising" && form.frequencies.length === 0) {
      return setError("Select at least one donation frequency.");
    }

    setSaving(true);

    const res = await fetch("/api/fundraisers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        office_id: form.office_id,
        title: form.title.trim(),
        description: form.description || null,
        form_type: form.form_type,
        funds,
        frequencies: form.form_type === "event" ? ["ONE_TIME"] : form.frequencies,
        color: form.color,
        header_image: form.header_image || null,
        story: form.story || null,
        goal: form.goal ? Number(form.goal) : null,
        event_date: form.form_type === "event" ? form.event_date || null : null,
        start_time: form.form_type === "event" ? form.start_time || null : null,
        end_time: form.form_type === "event" ? form.end_time || null : null,
        location: form.form_type === "event" ? form.location || null : null,
      }),
    });

    const body = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }

    router.push(`/fundraisers/${body.fundraiser.id}`);
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">New Fundraiser</h1>
          <Link href="/fundraisers" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
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
                  onChange={(e) => update("office_id", e.target.value)}
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
              <label className={labelClass}>Type *</label>
              <select
                value={form.form_type}
                onChange={(e) => update("form_type", e.target.value as "fundraising" | "event")}
                className={inputClass}
              >
                <option value="fundraising">Fundraising campaign</option>
                <option value="event">Ticketed event</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                className={inputClass}
                placeholder="e.g. Houston Ramadan Food Drive 2026"
              />
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Short one-liner — shown on the donation form itself"
              />
            </div>

            <div>
              <label className={labelClass}>Hero Image URL</label>
              <input
                value={form.header_image}
                onChange={(e) => update("header_image", e.target.value)}
                className={inputClass}
                placeholder="Shown at the top of the fundraiser page"
              />
            </div>

            <div>
              <label className={labelClass}>Story</label>
              <textarea
                value={form.story}
                onChange={(e) => update("story", e.target.value)}
                rows={6}
                className={inputClass}
                placeholder="The full 'why' — this becomes the Our Story section on the fundraiser's page. Separate paragraphs with a blank line."
              />
            </div>

            <div>
              <label className={labelClass}>Fund(s) *</label>
              <input
                required
                value={form.funds}
                onChange={(e) => update("funds", e.target.value)}
                className={inputClass}
                placeholder="General Fund, Ramadan Fund (comma-separated)"
              />
            </div>

            {form.form_type === "fundraising" && (
              <div>
                <label className={labelClass}>Donation Frequencies *</label>
                <div className="flex gap-3 flex-wrap">
                  {FREQUENCY_OPTIONS.map((freq) => (
                    <label key={freq} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={form.frequencies.includes(freq)}
                        onChange={() => toggleFrequency(freq)}
                      />
                      {freq.replace("_", " ").toLowerCase()}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Fundraising Goal ($)</label>
                <input
                  type="number"
                  min="0"
                  value={form.goal}
                  onChange={(e) => update("goal", e.target.value)}
                  className={inputClass}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className={labelClass}>Form Color</label>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => update("color", e.target.value)}
                  className={inputClass + " h-[38px]"}
                />
              </div>
            </div>

            {form.form_type === "event" && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Event Date</label>
                    <input
                      type="date"
                      value={form.event_date}
                      onChange={(e) => update("event_date", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Start Time</label>
                    <input
                      type="time"
                      value={form.start_time}
                      onChange={(e) => update("start_time", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>End Time</label>
                    <input
                      type="time"
                      value={form.end_time}
                      onChange={(e) => update("end_time", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Location</label>
                  <input
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-dim)]">
                  Ticket types can be added after creation from the fundraiser's manage page — at least one is
                  required before this can be published.
                </p>
              </>
            )}
          </section>

          <p className="text-xs text-[var(--color-text-dim)]">
            If a CharityStack API key hasn't been added yet (Admin → Connectors), this saves as a draft and
            can be synced later with no re-entry needed.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Fundraiser"}
          </button>
        </form>
      </div>
    </main>
  );
}
