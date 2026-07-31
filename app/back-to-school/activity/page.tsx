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

export default function NewB2SActivityPage() {
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
    cash_donations: "",
    in_kind_donation_value: "",
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
    const textFields = new Set([
      "office_id", "workshop_topic", "webinar_topic", "webinar_hosted_by",
      "elected_official_name_title", "elected_official_visit_purpose",
      "sfa_activity_type", "media_visibility_type", "media_shared_where", "media_links",
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

    const { error: insertError } = await supabase
      .from("b2s_program_activities")
      .insert(payload);

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/back-to-school");
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

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">B2S Program Activity</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Workshops, webinars, outreach — not tied to a specific client
            </p>
          </div>
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

          <Section title="Workshops">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.workshop_conducted} onChange={(e) => update("workshop_conducted", e.target.checked as any)} />
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

          <Section title="Webinars">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.webinar_conducted} onChange={(e) => update("webinar_conducted", e.target.checked as any)} />
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
                <input value={form.webinar_hosted_by} onChange={(e) => update("webinar_hosted_by", e.target.value)} className={inputClass} />
              </div>
            </div>
          </Section>

          <Section title="Elected Officials Engagement">
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.invited_elected_officials} onChange={(e) => update("invited_elected_officials", e.target.checked as any)} />
                Invited
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.elected_officials_attended} onChange={(e) => update("elected_officials_attended", e.target.checked as any)} />
                Attended
              </label>
            </div>
            <div>
              <label className={labelClass}>Name – Title – Office/Jurisdiction</label>
              <input value={form.elected_official_name_title} onChange={(e) => update("elected_official_name_title", e.target.value)} className={inputClass} />
            </div>
          </Section>

          <Section title="Student Financial Assistance (SFA)">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Activity Type</label>
                <input value={form.sfa_activity_type} onChange={(e) => update("sfa_activity_type", e.target.value)} className={inputClass} />
              </div>
              <NumInput field="sfa_individuals_awarded" label="Individuals Awarded" />
              <NumInput field="sfa_amount_disbursed" label="Amount Disbursed" />
            </div>
          </Section>

          <Section title="Ambassador Program">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ambassador_recruitment_conducted} onChange={(e) => update("ambassador_recruitment_conducted", e.target.checked as any)} />
              Recruitment conducted
            </label>
            <NumInput field="ambassador_interested_count" label="Individuals Interested" />
          </Section>

          <Section title="Media & Public Visibility">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Visibility Type</label>
                <input value={form.media_visibility_type} onChange={(e) => update("media_visibility_type", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Shared Where</label>
                <input value={form.media_shared_where} onChange={(e) => update("media_shared_where", e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Link(s)</label>
              <input value={form.media_links} onChange={(e) => update("media_links", e.target.value)} className={inputClass} />
            </div>
          </Section>

          <Section title="EMPOWER Grant">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="empower_grants_approved" label="Grants Approved" />
              <NumInput field="empower_amount_disbursed" label="Amount Disbursed" />
            </div>
          </Section>

          <Section title="General Donations">
            <div className="grid grid-cols-2 gap-4">
              <NumInput field="cash_donations" label="Cash Donations" />
              <NumInput field="in_kind_donation_value" label="In-Kind Donation Value" />
            </div>
          </Section>

          <Section title="Partner Scholarships">
            <div className="grid grid-cols-3 gap-4">
              <NumInput field="partner_scholarships_count" label="No. of Scholarships" />
              <NumInput field="partner_scholarship_funding" label="Funding" />
              <NumInput field="partner_scholarship_funding_disbursed" label="Funding Disbursed" />
            </div>
          </Section>

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
