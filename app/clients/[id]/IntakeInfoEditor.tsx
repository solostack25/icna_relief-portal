"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ClientIntakeFields = {
  id: string;
  middle_initial: string | null;
  apt_unit_no: string | null;
  country_of_birth: string | null;
  country_of_citizenship: string | null;
  gender: string | null;
  marital_status: string | null;
  snap: boolean | null;
  wic: boolean | null;
  chip: boolean | null;
  employed: boolean | null;
  employment_type: string | null;
  residency_status: string | null;
  race_ethnicity: string | null;
  monthly_income_range: string | null;
  household_vehicle_count: number | null;
};

const RESIDENCY_OPTIONS = [
  "Citizen", "Green Card", "Asylum", "TPS", "Student", "Visit Visa", "Other", "Prefer not to answer",
];
const RACE_OPTIONS = [
  "White/Caucasian", "Black or African American", "Hispanic/Latino (Any race)", "Arab/Middle Eastern",
  "East or South East Asian", "South Asian", "Alaskan Native", "Hawaiian or Pacific Islander",
  "Iranian or Central Asian", "Prefer not to answer", "Two or more races", "Native American",
];
const INCOME_OPTIONS = ["0-$24,999", "$25,000-$49,999", "$50,000-$64,999", "Over $65,000"];

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

// Which of the new fields are actually filled in — used to decide
// whether this section opens collapsed (complete) or expanded
// (needs attention) by default, and to show a quick completeness count.
function countFilled(c: ClientIntakeFields) {
  const fields = [
    c.gender, c.marital_status, c.country_of_birth, c.country_of_citizenship,
    c.residency_status, c.race_ethnicity, c.monthly_income_range,
    c.snap, c.wic, c.chip, c.employed,
  ];
  return fields.filter((v) => v !== null && v !== undefined && v !== "").length;
}

export default function IntakeInfoEditor({ client }: { client: ClientIntakeFields }) {
  const supabase = createClient();
  const router = useRouter();

  const filledCount = countFilled(client);
  const totalCount = 11;
  const isComplete = filledCount === totalCount;

  const [open, setOpen] = useState(!isComplete);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    middle_initial: client.middle_initial ?? "",
    apt_unit_no: client.apt_unit_no ?? "",
    country_of_birth: client.country_of_birth ?? "",
    country_of_citizenship: client.country_of_citizenship ?? "",
    gender: client.gender ?? "",
    marital_status: client.marital_status ?? "",
    snap: client.snap ?? false,
    wic: client.wic ?? false,
    chip: client.chip ?? false,
    employed: client.employed ?? false,
    employment_type: client.employment_type ?? "NA",
    residency_status: client.residency_status ?? "",
    race_ethnicity: client.race_ethnicity ?? "",
    monthly_income_range: client.monthly_income_range ?? "",
    household_vehicle_count: client.household_vehicle_count?.toString() ?? "",
  });

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        middle_initial: form.middle_initial || null,
        apt_unit_no: form.apt_unit_no || null,
        country_of_birth: form.country_of_birth || null,
        country_of_citizenship: form.country_of_citizenship || null,
        gender: form.gender || null,
        marital_status: form.marital_status || null,
        snap: form.snap,
        wic: form.wic,
        chip: form.chip,
        employed: form.employed,
        employment_type: form.employed ? form.employment_type : "NA",
        residency_status: form.residency_status || null,
        race_ethnicity: form.race_ethnicity || null,
        monthly_income_range: form.monthly_income_range || null,
        household_vehicle_count: form.household_vehicle_count ? Number(form.household_vehicle_count) : null,
      })
      .eq("id", client.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-medium">Intake Info</h2>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            {isComplete
              ? "Complete"
              : `${filledCount}/${totalCount} fields filled — click to complete this profile`}
          </p>
        </div>
        <span className="text-[var(--color-text-dim)] text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Middle Initial</label>
              <input maxLength={1} value={form.middle_initial} onChange={(e) => update("middle_initial", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Apt/Unit No</label>
              <input value={form.apt_unit_no} onChange={(e) => update("apt_unit_no", e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Gender</label>
              <select value={form.gender} onChange={(e) => update("gender", e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Marital Status</label>
              <select value={form.marital_status} onChange={(e) => update("marital_status", e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                <option>Single</option>
                <option>Married</option>
                <option>Divorced</option>
                <option>Widowed</option>
                <option>Separated</option>
                <option>Prefer not to answer</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Country of Birth</label>
              <input value={form.country_of_birth} onChange={(e) => update("country_of_birth", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Country of Citizenship</label>
              <input value={form.country_of_citizenship} onChange={(e) => update("country_of_citizenship", e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Residency Status</label>
            <select value={form.residency_status} onChange={(e) => update("residency_status", e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              {RESIDENCY_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Race & Ethnicity</label>
            <select value={form.race_ethnicity} onChange={(e) => update("race_ethnicity", e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              {RACE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.snap} onChange={(e) => update("snap", e.target.checked)} />
              SNAP
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.wic} onChange={(e) => update("wic", e.target.checked)} />
              WIC
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.chip} onChange={(e) => update("chip", e.target.checked)} />
              CHIP
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.employed} onChange={(e) => update("employed", e.target.checked)} />
              Employed
            </label>
            {form.employed && (
              <select value={form.employment_type} onChange={(e) => update("employment_type", e.target.value)} className={inputClass}>
                <option value="FT">Full-time</option>
                <option value="PT">Part-time</option>
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--color-border)]">
            <div>
              <label className={labelClass}>Monthly Income</label>
              <select value={form.monthly_income_range} onChange={(e) => update("monthly_income_range", e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                {INCOME_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Vehicles in Household</label>
              <input type="number" min={0} value={form.household_vehicle_count} onChange={(e) => update("household_vehicle_count", e.target.value)} className={inputClass} />
            </div>
          </div>

          {error && <p className="text-sm text-[#B55139]">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-2.5 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Intake Info"}
          </button>
        </div>
      )}
    </section>
  );
}
