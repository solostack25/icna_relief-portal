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

export default function NewFateSubmissionPage() {
  const supabase = createClient();
  const router = useRouter();

  const [offices, setOffices] = useState<Office[]>([]);
  const [assignedOffice, setAssignedOffice] = useState<Office | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [form, setForm] = useState({
    office_id: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    state: "",
    city: "",
    liaison_name: "",
    new_inquiries: "",
    families_served_new: "",
    families_served_ongoing: "",
    children_served_new: "",
    children_served_ongoing: "",
    people_served_new: "",
    people_served_ongoing: "",
    consultation_hours: "",
    consultation_value: "",
    referrals_count: "",
    referrals_value: "",
    outgoing_donation_value: "",
    other_assistance_type: "",
    other_assistance_value: "",
    volunteers: "",
    volunteer_hours: "",
    professional_volunteers: "",
    professional_volunteer_hours: "",
    professional_volunteering_value: "",
    workshops_events: "",
    workshop_event_cost: "",
    workshop_attendees: "",
    workshop_attendee_value: "",
    licensed_muslim_foster_families: "",
    certified_casas: "",
    outreach_collaboration: "",
    cash_donation: "",
    in_kind_donation: "",
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
    const textFieldPattern = /^(state|city|liaison_name|other_assistance_type)$/;
    for (const key of Object.keys(payload)) {
      const val = payload[key];
      if (typeof val === "string" && val !== "" && !isNaN(Number(val)) && key !== "office_id") {
        payload[key] = Number(val);
      } else if (val === "" && key !== "office_id") {
        payload[key] = textFieldPattern.test(key) ? null : 0;
      }
    }

    const { error: insertError } = await supabase
      .from("fate_submissions")
      .insert(payload);

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/fate");
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
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

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">New F.A.T.E. Submission</h1>
          <Link
            href="/fate"
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
                <label className={labelClass}>Month</label>
                <select
                  value={form.month}
                  onChange={(e) => update("month", Number(e.target.value))}
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
                  onChange={(e) => update("year", Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>State</label>
                <input value={form.state} onChange={(e) => update("state", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input value={form.city} onChange={(e) => update("city", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Liaison Name</label>
                <input value={form.liaison_name} onChange={(e) => update("liaison_name", e.target.value)} className={inputClass} />
              </div>
            </div>
          </Section>

          <Section title="Inquiries & Cases">
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="new_inquiries" label="New Inquiries" />
              <NumInput field="families_served_new" label="Families Served (New)" />
              <NumInput field="families_served_ongoing" label="Families Served (Ongoing)" />
              <NumInput field="children_served_new" label="Children Served (New)" />
              <NumInput field="children_served_ongoing" label="Children Served (Ongoing)" />
              <NumInput field="people_served_new" label="People Served (New)" />
              <NumInput field="people_served_ongoing" label="People Served (Ongoing)" />
            </div>
          </Section>

          <Section title="Case Management & Referrals">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="consultation_hours" label="Consultation/Case Mgmt Hours" />
              <NumInput field="consultation_value" label="Consultation/Case Mgmt Value ($)" />
              <NumInput field="referrals_count" label="Referrals (Count)" />
              <NumInput field="referrals_value" label="Referrals (Value $)" />
              <NumInput field="outgoing_donation_value" label="Outgoing Donation Value ($)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Other Assistance Type</label>
                <input value={form.other_assistance_type} onChange={(e) => update("other_assistance_type", e.target.value)} className={inputClass} placeholder="e.g. Legal" />
              </div>
              <NumInput field="other_assistance_value" label="Other Assistance Value ($)" />
            </div>
          </Section>

          <Section title="Volunteers">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="volunteers" label="Volunteers" />
              <NumInput field="volunteer_hours" label="Volunteer Hours" />
              <NumInput field="professional_volunteers" label="Professional Volunteers" />
              <NumInput field="professional_volunteer_hours" label="Professional Volunteer Hours" />
              <NumInput field="professional_volunteering_value" label="Professional Volunteering Value ($)" />
            </div>
          </Section>

          <Section title="Workshops & Events">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="workshops_events" label="Workshops/Events" />
              <NumInput field="workshop_event_cost" label="Event/Workshop Cost ($)" />
              <NumInput field="workshop_attendees" label="Attendees" />
              <NumInput field="workshop_attendee_value" label="Attendee Value ($)" />
            </div>
          </Section>

          <Section title="Program Status">
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="licensed_muslim_foster_families" label="Licensed Muslim Foster Families" />
              <NumInput field="certified_casas" label="Certified CASAs" />
              <NumInput field="outreach_collaboration" label="Outreach/Collaboration" />
            </div>
          </Section>

          <Section title="Donations">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="cash_donation" label="Cash Donation ($)" />
              <NumInput field="in_kind_donation" label="In-Kind Donation ($)" />
            </div>
          </Section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-black font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Submit"}
          </button>
        </form>
      </div>
    </main>
  );
}
