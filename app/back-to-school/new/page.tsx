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

export default function NewB2SSubmissionPage() {
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
    distribution_city: "",
    distribution_zip: "",
    distribution_type: "",
    event_location_name: "",
    event_street_address: "",
    is_mega_distribution_day: false,
    elementary_backpacks: "",
    middle_backpacks: "",
    high_backpacks: "",
    households_served: "",
    elementary_boys: "",
    elementary_girls: "",
    middle_boys: "",
    middle_girls: "",
    high_boys: "",
    high_girls: "",
    income_0_19999: "",
    income_20000_39999: "",
    income_40000_plus: "",
    income_unknown: "",
    race_afghan: "",
    race_asian: "",
    race_arab_middle_eastern: "",
    race_native_american_pacific_islander: "",
    race_black_african_american: "",
    race_hispanic_latino: "",
    race_white_caucasian: "",
    race_ukrainian: "",
    race_other: "",
    race_unknown: "",
    workshop_conducted: false,
    workshop_topic: "",
    workshop_attendees: "",
    webinar_conducted: false,
    webinar_topic: "",
    webinar_attendees: "",
    webinar_hosted_by: "",
    invited_elected_officials: false,
    elected_officials_attended: false,
    elected_official_name_title: "",
    elected_official_visit_purpose: "",
    sfa_activity_type: "",
    sfa_individuals_awarded: "",
    sfa_amount_disbursed: "",
    ambassador_recruitment_conducted: false,
    ambassador_interested_count: "",
    media_visibility_type: "",
    media_shared_where: "",
    media_links: "",
    empower_grants_approved: "",
    empower_amount_disbursed: "",
    in_kind_donation_value: "",
    cash_donations: "",
    value_of_backpacks: "",
    partner_scholarships_count: "",
    partner_scholarship_funding: "",
    partner_scholarship_funding_disbursed: "",
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
    const textFieldPattern = /^(distribution_(city|zip|type)|event_|workshop_topic|webinar_topic|webinar_hosted_by|elected_official|sfa_activity_type|media_)/;
    for (const key of Object.keys(payload)) {
      const val = payload[key];
      if (typeof val === "string" && val !== "" && !isNaN(Number(val)) && key !== "office_id") {
        payload[key] = Number(val);
      } else if (val === "" && key !== "office_id") {
        payload[key] = textFieldPattern.test(key) ? null : 0;
      }
    }

    const { error: insertError } = await supabase
      .from("b2s_submissions")
      .insert(payload);

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/back-to-school");
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
          <h1 className="text-xl font-semibold">New B2S Submission</h1>
          <Link
            href="/back-to-school"
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
          </Section>

          <Section title="A. Distribution Details">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>City</label>
                <input value={form.distribution_city} onChange={(e) => update("distribution_city", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Zip Code</label>
                <input value={form.distribution_zip} onChange={(e) => update("distribution_zip", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Distribution Type</label>
                <input value={form.distribution_type} onChange={(e) => update("distribution_type", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Event Location Name</label>
                <input value={form.event_location_name} onChange={(e) => update("event_location_name", e.target.value)} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Event Street Address</label>
                <input value={form.event_street_address} onChange={(e) => update("event_street_address", e.target.value)} className={inputClass} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_mega_distribution_day} onChange={(e) => update("is_mega_distribution_day", e.target.checked)} />
              Part of a Mega Distribution Day
            </label>
          </Section>

          <Section title="B. Backpack Distribution Counts">
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="elementary_backpacks" label="Elementary Backpacks" />
              <NumInput field="middle_backpacks" label="Middle School Backpacks" />
              <NumInput field="high_backpacks" label="High School Backpacks" />
              <NumInput field="households_served" label="Households Served" />
            </div>
            <p className="text-xs text-[var(--color-text-dim)]">
              Gender breakdown (optional — fill in if collected)
            </p>
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="elementary_boys" label="Elementary Boys" />
              <NumInput field="elementary_girls" label="Elementary Girls" />
              <div />
              <NumInput field="middle_boys" label="Middle Boys" />
              <NumInput field="middle_girls" label="Middle Girls" />
              <div />
              <NumInput field="high_boys" label="High School Boys" />
              <NumInput field="high_girls" label="High School Girls" />
            </div>
          </Section>

          <Section title="C. Household Income Demographics">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="income_0_19999" label="Income $0–$19,999" />
              <NumInput field="income_20000_39999" label="Income $20,000–$39,999" />
              <NumInput field="income_40000_plus" label="Income $40,000+" />
              <NumInput field="income_unknown" label="Not collected / unknown" />
            </div>
          </Section>

          <Section title="D. Race / Ethnicity Demographics">
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="race_afghan" label="Afghan" />
              <NumInput field="race_asian" label="Asian" />
              <NumInput field="race_arab_middle_eastern" label="Arab / Middle Eastern" />
              <NumInput field="race_native_american_pacific_islander" label="Native American / PI" />
              <NumInput field="race_black_african_american" label="Black / African American" />
              <NumInput field="race_hispanic_latino" label="Hispanic / Latino" />
              <NumInput field="race_white_caucasian" label="White / Caucasian" />
              <NumInput field="race_ukrainian" label="Ukrainian" />
              <NumInput field="race_other" label="Other" />
              <NumInput field="race_unknown" label="Not collected / unknown" />
            </div>
          </Section>

          <Section title="E. Workshops">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.workshop_conducted} onChange={(e) => update("workshop_conducted", e.target.checked)} />
              Workshop conducted
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Topic</label>
                <input value={form.workshop_topic} onChange={(e) => update("workshop_topic", e.target.value)} className={inputClass} />
              </div>
              <NumInput field="workshop_attendees" label="Attendees" />
            </div>
          </Section>

          <Section title="F. Webinars">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.webinar_conducted} onChange={(e) => update("webinar_conducted", e.target.checked)} />
              Webinar conducted
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Topic</label>
                <input value={form.webinar_topic} onChange={(e) => update("webinar_topic", e.target.value)} className={inputClass} />
              </div>
              <NumInput field="webinar_attendees" label="Attendees" />
              <div>
                <label className={labelClass}>Hosted By</label>
                <input value={form.webinar_hosted_by} onChange={(e) => update("webinar_hosted_by", e.target.value)} className={inputClass} placeholder="Field office / National" />
              </div>
            </div>
          </Section>

          <Section title="G. Elected Officials Engagement">
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.invited_elected_officials} onChange={(e) => update("invited_elected_officials", e.target.checked)} />
                Invited
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.elected_officials_attended} onChange={(e) => update("elected_officials_attended", e.target.checked)} />
                Attended
              </label>
            </div>
            <div>
              <label className={labelClass}>Name – Title – Office/Jurisdiction</label>
              <input value={form.elected_official_name_title} onChange={(e) => update("elected_official_name_title", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Purpose (optional)</label>
              <input value={form.elected_official_visit_purpose} onChange={(e) => update("elected_official_visit_purpose", e.target.value)} className={inputClass} />
            </div>
          </Section>

          <Section title="H. Student Financial Assistance (SFA)">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Activity Type</label>
                <input value={form.sfa_activity_type} onChange={(e) => update("sfa_activity_type", e.target.value)} className={inputClass} />
              </div>
              <NumInput field="sfa_individuals_awarded" label="Individuals Awarded" />
              <NumInput field="sfa_amount_disbursed" label="Amount Disbursed" />
            </div>
          </Section>

          <Section title="I. Ambassador Program">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ambassador_recruitment_conducted} onChange={(e) => update("ambassador_recruitment_conducted", e.target.checked)} />
              Recruitment conducted
            </label>
            <NumInput field="ambassador_interested_count" label="Individuals Interested" />
          </Section>

          <Section title="J. Media & Public Visibility">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Visibility Type</label>
                <input value={form.media_visibility_type} onChange={(e) => update("media_visibility_type", e.target.value)} className={inputClass} placeholder="News / Social Media" />
              </div>
              <div>
                <label className={labelClass}>Shared Where</label>
                <input value={form.media_shared_where} onChange={(e) => update("media_shared_where", e.target.value)} className={inputClass} placeholder="Facebook / Instagram" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Link(s)</label>
              <input value={form.media_links} onChange={(e) => update("media_links", e.target.value)} className={inputClass} />
            </div>
          </Section>

          <Section title="K. EMPOWER Grant">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="empower_grants_approved" label="Grants Approved" />
              <NumInput field="empower_amount_disbursed" label="Amount Disbursed" />
            </div>
          </Section>

          <Section title="Donations & Value">
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="in_kind_donation_value" label="In-Kind Donation Value" />
              <NumInput field="cash_donations" label="Cash Donations" />
              <NumInput field="value_of_backpacks" label="Value of Backpacks" />
            </div>
          </Section>

          <Section title="Partner Scholarships">
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="partner_scholarships_count" label="No. of Scholarships" />
              <NumInput field="partner_scholarship_funding" label="Funding" />
              <NumInput field="partner_scholarship_funding_disbursed" label="Funding Disbursed" />
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
