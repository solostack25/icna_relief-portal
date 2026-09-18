"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { ORLANDO_OFFICE_ID as OFFICE_ID, ORLANDO_STATE as DEFAULT_STATE } from "@/lib/orlandoAutomation/config";

// Same household intake as the main portal (/intake/new-household): every
// household member gets their own full client record and Client ID, all
// sharing one household_key, created in one call to create_household_intake.
// Differences from the portal version, both specific to this app:
//  - the office is fixed (passed as p_office_id) instead of coming from the
//    signed-in employee's assigned office;
//  - Dietary Preference is captured for the household, since Halal /
//    Non-Halal decides which distribution slots the client can book.
// It also keeps this app's duplicate check before creating anyone.

type Member = {
  first_name: string;
  middle_initial: string;
  last_name: string;
  dob: string;
  gender: string;
  marital_status: string;
  phone: string;
  email: string;
  address_line1: string;
  apt_unit_no: string;
  city: string;
  state: string;
  zip: string;
  country_of_birth: string;
  country_of_citizenship: string;
  snap: boolean;
  wic: boolean;
  chip: boolean;
  employed: boolean;
  employment_type: string;
  residency_status: string;
  race_ethnicity: string;
  monthly_income_range: string;
  household_vehicle_count: string;
  relationship_to_main_client: string;
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
const RELATIONSHIP_OPTIONS = ["Spouse", "Son", "Daughter", "Mother", "Father", "Sister", "Brother", "Other"];
const DIETARY_OPTIONS = ["None", "Halal", "Non-Halal", "Vegetarian", "Vegan", "Diabetic-Friendly", "Other"];

function blankMember(isMain: boolean): Member {
  return {
    first_name: "", middle_initial: "", last_name: "", dob: "", gender: "", marital_status: "",
    phone: "", email: "", address_line1: "", apt_unit_no: "", city: "", state: DEFAULT_STATE, zip: "",
    country_of_birth: "", country_of_citizenship: "", snap: false, wic: false, chip: false,
    employed: false, employment_type: "NA", residency_status: "", race_ethnicity: "",
    monthly_income_range: "", household_vehicle_count: "", relationship_to_main_client: isMain ? "" : "Son",
  };
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

export default function NewHouseholdIntakePage() {
  const supabase = createClient();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([blankMember(true)]);
  const [dietaryPreference, setDietaryPreference] = useState("");
  const [sameAddress, setSameAddress] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateMember(i: number, field: keyof Member, value: string | boolean) {
    setMembers((m) => m.map((mem, idx) => (idx === i ? { ...mem, [field]: value } : mem)));
  }

  function addMember() {
    const household = members[0];
    const next = blankMember(false);
    if (sameAddress) {
      next.address_line1 = household.address_line1;
      next.apt_unit_no = household.apt_unit_no;
      next.city = household.city;
      next.state = household.state;
      next.zip = household.zip;
    }
    setMembers((m) => [...m, next]);
  }

  function removeMember(i: number) {
    if (i === 0) return; // main client can't be removed
    setMembers((m) => m.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const main = members[0];
    if (!main.first_name || !main.last_name || !main.dob) {
      setError("The main client's first name, last name, and date of birth are required.");
      return;
    }

    setSaving(true);

    // Duplicate check on the main client (phone match first, then
    // name + DOB) - it searches every office, so only send staff to the
    // existing profile when that person belongs to this office.
    const { data: matchData } = await supabase.rpc("match_existing_client", {
      p_phone: main.phone,
      p_first_name: main.first_name,
      p_last_name: main.last_name,
      p_dob: main.dob || null,
    });
    const match = matchData?.[0];
    if (match?.matched) {
      const { data: matched } = await supabase
        .from("clients")
        .select("id")
        .eq("id", match.client_id)
        .eq("office_id", OFFICE_ID)
        .maybeSingle();
      setSaving(false);
      if (matched) {
        router.push(`/orlando-automation/clients/${match.client_id}?existing=1`);
      } else {
        setError(
          `This person is already registered with another ICNA Relief office (client #${match.client_number ?? "—"}). Ask an admin to move them to Orlando rather than registering them twice.`
        );
      }
      return;
    }

    // The main client's address carries to members that share it.
    const payload = members.map((m, i) => {
      const addr =
        i > 0 && sameAddress
          ? { address_line1: main.address_line1, apt_unit_no: main.apt_unit_no, city: main.city, state: main.state, zip: main.zip }
          : {};
      return {
        ...m,
        ...addr,
        household_vehicle_count: m.household_vehicle_count || null,
        dietary_preference: dietaryPreference || null,
      };
    });

    const { data, error: rpcError } = await supabase.rpc("create_household_intake", {
      p_members: payload,
      p_office_id: OFFICE_ID,
    });

    if (rpcError) {
      setSaving(false);
      setError(rpcError.message);
      return;
    }

    const mainRecord = data?.find((r: { is_main: boolean }) => r.is_main);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };
    await logAudit(supabase, employee?.id ?? null, "staff_register_household", "client", mainRecord?.client_id ?? null, {
      members: members.length,
    });

    setSaving(false);
    if (mainRecord) router.push(`/orlando-automation/clients/${mainRecord.client_id}?created=1`);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">New Household Intake</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Every household member gets their own full record and Client ID
            </p>
          </div>
          <Link href="/orlando-automation/clients" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back to search
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {members.map((member, i) => (
            <section
              key={i}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">
                  {i === 0 ? "Main Client (Head of Household)" : `Household Member ${i + 1}`}
                </h2>
                {i > 0 && (
                  <button type="button" onClick={() => removeMember(i)} className="text-[#B55139] text-xs">
                    Remove
                  </button>
                )}
              </div>

              {i > 0 && (
                <div>
                  <label className={labelClass}>Relationship to Main Client</label>
                  <select
                    value={member.relationship_to_main_client}
                    onChange={(e) => updateMember(i, "relationship_to_main_client", e.target.value)}
                    className={inputClass}
                  >
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>First Name *</label>
                  <input required value={member.first_name} onChange={(e) => updateMember(i, "first_name", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>M.I.</label>
                  <input maxLength={1} value={member.middle_initial} onChange={(e) => updateMember(i, "middle_initial", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Last Name *</label>
                  <input required value={member.last_name} onChange={(e) => updateMember(i, "last_name", e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Date of Birth *</label>
                  <input required type="date" value={member.dob} onChange={(e) => updateMember(i, "dob", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Gender</label>
                  <select value={member.gender} onChange={(e) => updateMember(i, "gender", e.target.value)} className={inputClass}>
                    <option value="">Select...</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Marital Status</label>
                  <select value={member.marital_status} onChange={(e) => updateMember(i, "marital_status", e.target.value)} className={inputClass}>
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
                  <label className={labelClass}>Phone</label>
                  <input value={member.phone} onChange={(e) => updateMember(i, "phone", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={member.email} onChange={(e) => updateMember(i, "email", e.target.value)} className={inputClass} />
                </div>
              </div>

              {i === 0 && (
                <div className="pt-2 border-t border-[var(--color-border)]">
                  <p className="text-xs font-medium mb-3 text-[var(--color-text-dim)]">Household Address</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-3">
                      <label className={labelClass}>Street Address</label>
                      <input value={member.address_line1} onChange={(e) => updateMember(i, "address_line1", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Apt/Unit</label>
                      <input value={member.apt_unit_no} onChange={(e) => updateMember(i, "apt_unit_no", e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className={labelClass}>City</label>
                      <input value={member.city} onChange={(e) => updateMember(i, "city", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>State</label>
                      <input value={member.state} onChange={(e) => updateMember(i, "state", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Zip Code</label>
                      <input value={member.zip} onChange={(e) => updateMember(i, "zip", e.target.value)} className={inputClass} />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Country of Birth</label>
                  <input value={member.country_of_birth} onChange={(e) => updateMember(i, "country_of_birth", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Country of Citizenship</label>
                  <input value={member.country_of_citizenship} onChange={(e) => updateMember(i, "country_of_citizenship", e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>Residency Status</label>
                <select value={member.residency_status} onChange={(e) => updateMember(i, "residency_status", e.target.value)} className={inputClass}>
                  <option value="">Select...</option>
                  {RESIDENCY_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className={labelClass}>Race & Ethnicity</label>
                <select value={member.race_ethnicity} onChange={(e) => updateMember(i, "race_ethnicity", e.target.value)} className={inputClass}>
                  <option value="">Select...</option>
                  {RACE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4 items-center pt-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={member.snap} onChange={(e) => updateMember(i, "snap", e.target.checked)} />
                  SNAP
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={member.wic} onChange={(e) => updateMember(i, "wic", e.target.checked)} />
                  WIC
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={member.chip} onChange={(e) => updateMember(i, "chip", e.target.checked)} />
                  CHIP
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={member.employed} onChange={(e) => updateMember(i, "employed", e.target.checked)} />
                  Employed
                </label>
                {member.employed && (
                  <select value={member.employment_type} onChange={(e) => updateMember(i, "employment_type", e.target.value)} className={inputClass}>
                    <option value="FT">Full-time</option>
                    <option value="PT">Part-time</option>
                  </select>
                )}
              </div>

              {i === 0 && (
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--color-border)]">
                  <div>
                    <label className={labelClass}>Monthly Income</label>
                    <select value={member.monthly_income_range} onChange={(e) => updateMember(i, "monthly_income_range", e.target.value)} className={inputClass}>
                      <option value="">Select...</option>
                      {INCOME_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Vehicles in Household</label>
                    <input type="number" min={0} value={member.household_vehicle_count} onChange={(e) => updateMember(i, "household_vehicle_count", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Dietary Preference</label>
                    <select value={dietaryPreference} onChange={(e) => setDietaryPreference(e.target.value)} className={inputClass}>
                      <option value="">Select...</option>
                      {DIETARY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </section>
          ))}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
              <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} />
              New members share the main client&apos;s address
            </label>
            <button type="button" onClick={addMember} className="text-sm text-[var(--color-accent)] hover:underline">
              + Add household member
            </button>
          </div>

          {error && <p className="text-sm text-[#B55139]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent-solid)] text-white font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Registering household..." : `Register Household (${members.length} member${members.length > 1 ? "s" : ""})`}
          </button>
        </form>
      </div>
    </main>
  );
}
