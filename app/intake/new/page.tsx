"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type HouseholdMember = {
  first_name: string;
  last_name: string;
  dob: string;
  relationship: string;
};

const ID_TYPES = ["State ID", "Driver's License", "Passport", "Other"];
const DIETARY_OPTIONS = ["None", "Halal", "Vegetarian", "Vegan", "Diabetic", "Other"];

export default function NewIntakePage() {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    phone: "",
    email: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "TX",
    zip: "",
    photo_id_number: "",
    id_type: "State ID",
    monthly_income: "",
    food_stamps_amount: "",
    dietary_preference: "None",
    ethnicity: "",
    country_of_origin: "",
  });

  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addMember() {
    setMembers((m) => [
      ...m,
      { first_name: "", last_name: "", dob: "", relationship: "child" },
    ]);
  }

  function updateMember(index: number, field: keyof HouseholdMember, value: string) {
    setMembers((m) =>
      m.map((mem, i) => (i === index ? { ...mem, [field]: value } : mem))
    );
  }

  function removeMember(index: number) {
    setMembers((m) => m.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.first_name || !form.last_name) {
      setError("First and last name are required.");
      return;
    }

    setSaving(true);

    const { data, error: rpcError } = await supabase.rpc(
      "create_client_with_intake",
      {
        p_first_name: form.first_name,
        p_last_name: form.last_name,
        p_dob: form.dob || null,
        p_phone: form.phone || null,
        p_email: form.email || null,
        p_address_line1: form.address_line1 || null,
        p_address_line2: form.address_line2 || null,
        p_city: form.city || null,
        p_state: form.state || null,
        p_zip: form.zip || null,
        p_photo_id_number: form.photo_id_number || null,
        p_id_type: form.id_type || null,
        p_monthly_income: form.monthly_income ? Number(form.monthly_income) : null,
        p_food_stamps_amount: form.food_stamps_amount
          ? Number(form.food_stamps_amount)
          : null,
        p_dietary_preference: form.dietary_preference || null,
        p_ethnicity: form.ethnicity || null,
        p_country_of_origin: form.country_of_origin || null,
        p_household_members: members.filter((m) => m.first_name && m.dob),
      }
    );

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const newClientId = data?.[0]?.client_id;
    if (newClientId) {
      router.push(`/clients/${newClientId}?created=1`);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">New Client Intake</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              This creates a client record shared across every program
            </p>
          </div>
          <Link
            href="/intake"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back to search
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Identity</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First Name *</label>
                <input
                  required
                  value={form.first_name}
                  onChange={(e) => updateField("first_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input
                  required
                  value={form.last_name}
                  onChange={(e) => updateField("last_name", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Date of Birth</label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={(e) => updateField("dob", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>ID Type</label>
                <select
                  value={form.id_type}
                  onChange={(e) => updateField("id_type", e.target.value)}
                  className={inputClass}
                >
                  {ID_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Photo ID Number</label>
              <input
                value={form.photo_id_number}
                onChange={(e) => updateField("photo_id_number", e.target.value)}
                className={inputClass}
              />
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Contact & Address</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Address</label>
              <input
                value={form.address_line1}
                onChange={(e) => updateField("address_line1", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>City</label>
                <input
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Zip Code</label>
                <input
                  value={form.zip}
                  onChange={(e) => updateField("zip", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Household & Income</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Monthly Income</label>
                <input
                  type="number"
                  value={form.monthly_income}
                  onChange={(e) => updateField("monthly_income", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Food Stamps Amount</label>
                <input
                  type="number"
                  value={form.food_stamps_amount}
                  onChange={(e) =>
                    updateField("food_stamps_amount", e.target.value)
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass + " mb-0"}>
                  Household Members ({members.length})
                </label>
                <button
                  type="button"
                  onClick={addMember}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  + Add member
                </button>
              </div>

              <p className="text-xs text-[var(--color-text-dim)] mb-3">
                Enter each person's date of birth — age is calculated
                automatically and stays accurate every year.
              </p>

              <div className="space-y-3">
                {members.map((member, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
                  >
                    <div>
                      <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
                        First name
                      </label>
                      <input
                        value={member.first_name}
                        onChange={(e) =>
                          updateMember(i, "first_name", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
                        DOB
                      </label>
                      <input
                        type="date"
                        value={member.dob}
                        onChange={(e) => updateMember(i, "dob", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
                        Relationship
                      </label>
                      <select
                        value={member.relationship}
                        onChange={(e) =>
                          updateMember(i, "relationship", e.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="spouse">Spouse</option>
                        <option value="child">Child</option>
                        <option value="dependent">Dependent</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(i)}
                      className="text-red-400 text-xs pb-2 px-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Demographics</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Ethnicity</label>
                <input
                  value={form.ethnicity}
                  onChange={(e) => updateField("ethnicity", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Country of Origin</label>
                <input
                  value={form.country_of_origin}
                  onChange={(e) =>
                    updateField("country_of_origin", e.target.value)
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Dietary Preference</label>
              <select
                value={form.dietary_preference}
                onChange={(e) =>
                  updateField("dietary_preference", e.target.value)
                }
                className={inputClass}
              >
                {DIETARY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-black font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Creating client..." : "Create Client & Issue ID"}
          </button>
        </form>
      </div>
    </main>
  );
}
