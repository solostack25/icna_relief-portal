"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Office = { id: string; region: string; field_office: string };
type ActivityType = { type_name: string; id_prefix: string };

export default function NewDrsSubmissionPage() {
  const supabase = createClient();
  const router = useRouter();

  const [offices, setOffices] = useState<Office[]>([]);
  const [assignedOffice, setAssignedOffice] = useState<Office | null>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [form, setForm] = useState({
    office_id: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    activity_occurred: false,
    activity_type: "",
    city_or_town: "",
    activity_name: "",
    response_location: "",
    chapter: "",
    state: "",
    event_id: "",
    response_no: "",
    activity_began_on: "",
    demobilized_on: "",
    individuals_served: "",
    households_served: "",
    volunteers_engaged: "",
    volunteer_hours: "",
    staff_engaged: "",
    staff_hours: "",
    in_kind_value: "",
    receipts_value: "",
    value_of_services: "",
  });

  useEffect(() => {
    supabase
      .from("b2s_offices")
      .select("id, region, field_office")
      .eq("is_active", true)
      .order("region")
      .then(({ data }) => setOffices(data ?? []));

    supabase
      .from("drs_activity_types")
      .select("type_name, id_prefix")
      .order("type_name")
      .then(({ data }) => setActivityTypes(data ?? []));

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

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: me } = await supabase
      .from("employees")
      .select("id")
      .eq("auth_user_id", user?.id)
      .single();

    const payload: Record<string, any> = { ...form, employee_id: me?.id };
    const textFields = new Set([
      "office_id", "activity_type", "city_or_town", "activity_name",
      "response_location", "chapter", "state", "event_id",
      "activity_began_on", "demobilized_on",
    ]);
    for (const key of Object.keys(payload)) {
      const val = payload[key];
      if (textFields.has(key)) {
        if (val === "") payload[key] = null;
        continue;
      }
      if (typeof val === "string") {
        payload[key] = val === "" ? 0 : Number(val);
      }
    }
    if (payload.response_no === 0) payload.response_no = null;

    const { error: insertError } = await supabase
      .from("drs_submissions")
      .insert(payload);

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/drs");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  function NumInput({ field, label }: { field: keyof typeof form; label: string }) {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <input
          type="number"
          value={form[field] as string}
          onChange={(e) => update(field, e.target.value as any)}
          className={inputClass}
        />
      </div>
    );
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {children}
      </section>
    );
  }

  const suggestedPrefix = activityTypes.find((t) => t.type_name === form.activity_type)?.id_prefix;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">New D.R.S. Submission</h1>
          <Link
            href="/drs"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Office & Period">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 sm:col-span-1">
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
                <label className={labelClass}>Reporting Month</label>
                <select
                  value={form.month}
                  onChange={(e) => update("month", Number(e.target.value) as any)}
                  className={inputClass}
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => update("year", Number(e.target.value) as any)}
                  className={inputClass}
                />
              </div>
            </div>
          </Section>

          <Section title="Was there any DRS activity this month?">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!form.activity_occurred}
                  onChange={() => update("activity_occurred", false as any)}
                />
                No
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.activity_occurred}
                  onChange={() => update("activity_occurred", true as any)}
                />
                Yes
              </label>
            </div>
          </Section>

          {form.activity_occurred && (
            <>
              <Section title="Activity Details">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Activity Type</label>
                    <select
                      value={form.activity_type}
                      onChange={(e) => update("activity_type", e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select...</option>
                      {activityTypes.map((t) => (
                        <option key={t.type_name} value={t.type_name}>
                          {t.type_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>City or Town</label>
                    <input value={form.city_or_town} onChange={(e) => update("city_or_town", e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Activity Name</label>
                    <input
                      value={form.activity_name}
                      onChange={(e) => update("activity_name", e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Chicago Fire, Louisiana Community Project"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Response Location (broader area)</label>
                    <input value={form.response_location} onChange={(e) => update("response_location", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Chapter</label>
                    <input value={form.chapter} onChange={(e) => update("chapter", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>State</label>
                    <input value={form.state} onChange={(e) => update("state", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Activity Began On</label>
                    <input type="date" value={form.activity_began_on} onChange={(e) => update("activity_began_on", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Demobilized On</label>
                    <input type="date" value={form.demobilized_on} onChange={(e) => update("demobilized_on", e.target.value)} className={inputClass} />
                  </div>
                </div>
              </Section>

              <Section title="Event ID (editable)">
                <p className="text-xs text-[var(--color-text-dim)]">
                  {suggestedPrefix
                    ? `Suggested prefix for ${form.activity_type}: ${suggestedPrefix}-[STATE][YY][MM][###]`
                    : "Select an activity type to see the suggested prefix."}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Event ID</label>
                    <input value={form.event_id} onChange={(e) => update("event_id", e.target.value)} className={inputClass} placeholder="e.g. DDRFR-IL2606111" />
                  </div>
                  <NumInput field="response_no" label="Response No." />
                </div>
              </Section>

              <Section title="Impact">
                <div className="grid grid-cols-2 gap-4">
                  <NumInput field="individuals_served" label="Individuals Served" />
                  <NumInput field="households_served" label="Households Served" />
                  <NumInput field="volunteers_engaged" label="Volunteers Engaged" />
                  <NumInput field="volunteer_hours" label="Volunteer Hours" />
                  <NumInput field="staff_engaged" label="ICNA Staff Engaged (Field)" />
                  <NumInput field="staff_hours" label="Staff Hours (Field)" />
                </div>
              </Section>

              <Section title="Value & Donations">
                <div className="grid grid-cols-3 gap-4">
                  <NumInput field="in_kind_value" label="In-Kind Donation Value ($)" />
                  <NumInput field="receipts_value" label="Receipts Generated ($)" />
                  <NumInput field="value_of_services" label="Total Value of Services ($)" />
                </div>
              </Section>
            </>
          )}

          {error && <p className="text-sm text-[#B55139]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Submit"}
          </button>
        </form>
      </div>
    </main>
  );
}
