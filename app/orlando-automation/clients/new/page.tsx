"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";
import { useAlert } from "@/lib/orlandoAutomation/alert";
import { ORLANDO_OFFICE_ID, ORLANDO_STATE } from "@/lib/orlandoAutomation/config";

type HouseholdMember = {
  first_name: string;
  last_name: string;
  dob: string;
  relationship: string;
};

// Stored values stay in English regardless of display language, so backend
// data (reports, Salesforce sync, etc.) stays consistent.
const ID_TYPES = [
  { value: "Driver's License", labelKey: "idType.dl" },
  { value: "State ID", labelKey: "idType.state" },
  { value: "Passport", labelKey: "idType.passport" },
  { value: "Other", labelKey: "idType.other" },
];
const DIETARY_PREFERENCES = [
  { value: "None", labelKey: "dietary.none" },
  { value: "Halal", labelKey: "dietary.halal" },
  { value: "Non-Halal", labelKey: "dietary.nonHalal" },
  { value: "Vegetarian", labelKey: "dietary.vegetarian" },
  { value: "Vegan", labelKey: "dietary.vegan" },
  { value: "Diabetic-Friendly", labelKey: "dietary.diabetic" },
  { value: "Other", labelKey: "dietary.other" },
];

export default function NewClientPage() {
  const supabase = createClient();
  const router = useRouter();
  const { t } = useLanguage();
  const { showAlert } = useAlert();

  const [saving, setSaving] = useState(false);
  const [assistedEntry, setAssistedEntry] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    phone: "",
    email: "",
    address_line1: "",
    address_line2: "",
    city: "",
    zip: "",
    id_type: "",
    photo_id_number: "",
    monthly_income: "",
    food_stamps_amount: "",
    dietary_preference: "",
    ethnicity: "",
    country_of_origin: "",
  });

  const [members, setMembers] = useState<HouseholdMember[]>([]);

  function update<K extends keyof typeof form>(field: K, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addMember() {
    setMembers((m) => [...m, { first_name: "", last_name: "", dob: "", relationship: "" }]);
  }

  function updateMember(index: number, field: keyof HouseholdMember, value: string) {
    setMembers((m) => m.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeMember(index: number) {
    setMembers((m) => m.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    // Same dedupe rule as the public portal: phone match wins and stops,
    // falls back to name+dob — keeps one source of truth for "is this a
    // new person" whether an employee or the client enters it.
    const { data: matchData } = await supabase.rpc("match_existing_client", {
      p_phone: form.phone,
      p_first_name: form.first_name,
      p_last_name: form.last_name,
      p_dob: form.dob || null,
    });

    const match = matchData?.[0];
    if (match?.matched) {
      // match_existing_client searches every office's clients. Only jump
      // to the profile if the match is an Orlando client - otherwise the
      // Orlando profile page (office-scoped) would just bounce back.
      const { data: matched } = await supabase
        .from("clients")
        .select("id")
        .eq("id", match.client_id)
        .eq("office_id", ORLANDO_OFFICE_ID)
        .maybeSingle();
      setSaving(false);
      if (matched) {
        router.push(`/orlando-automation/clients/${match.client_id}?existing=1`);
      } else {
        showAlert(t("newClient.matchOtherOffice", { number: match.client_number ?? "—" }), "error");
      }
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("clients")
      .insert({
        first_name: form.first_name,
        last_name: form.last_name,
        dob: form.dob || null,
        phone: form.phone || null,
        email: form.email || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        zip: form.zip || null,
        state: ORLANDO_STATE,
        office_id: ORLANDO_OFFICE_ID,
        photo_id_number: form.photo_id_number || null,
        id_type: form.id_type || null,
        monthly_income: form.monthly_income ? Number(form.monthly_income) : null,
        food_stamps_amount: form.food_stamps_amount ? Number(form.food_stamps_amount) : null,
        dietary_preference: form.dietary_preference || null,
        ethnicity: form.ethnicity || null,
        country_of_origin: form.country_of_origin || null,
        consent_given_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setSaving(false);
      showAlert(insertError?.message ?? t("newClient.errorGeneric"), "error");
      return;
    }

    const membersToInsert = members.filter((m) => m.first_name.trim());
    if (membersToInsert.length > 0) {
      await supabase.from("household_members").insert(
        membersToInsert.map((m) => ({
          client_id: inserted.id,
          first_name: m.first_name,
          last_name: m.last_name || null,
          dob: m.dob || null,
          relationship: m.relationship || null,
        }))
      );
    }

    await logAudit(supabase, employee?.id ?? null, "staff_register_client", "client", inserted.id, {
      assisted_entry: assistedEntry,
    });

    setSaving(false);
    router.push(`/orlando-automation/clients/${inserted.id}?created=1`);
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";
  const sectionClass = "space-y-4 pt-6 border-t border-[var(--color-border)] first:pt-0 first:border-0";
  const sectionTitle = "text-sm font-semibold";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">{t("newClient.title")}</h1>
            <p className="text-sm text-[var(--color-text-dim)]">{t("newClient.subtitle")}</p>
          </div>
          <Link
            href="/orlando-automation/clients"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            {t("common.backToSearch")}
          </Link>
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--color-text-dim)] mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <input
            type="checkbox"
            checked={assistedEntry}
            onChange={(e) => setAssistedEntry(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          {t("newClient.assistedEntry")}
        </label>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className={sectionClass}>
            <h2 className={sectionTitle}>{t("newClient.section.clientInfo")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="int-first-name" className={labelClass}>{t("intake.firstName")}</label>
                <input
                  id="int-first-name"
                  required
                  value={form.first_name}
                  onChange={(e) => update("first_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="int-last-name" className={labelClass}>{t("intake.lastName")}</label>
                <input
                  id="int-last-name"
                  required
                  value={form.last_name}
                  onChange={(e) => update("last_name", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="int-dob" className={labelClass}>{t("intake.dob")}</label>
                <input
                  id="int-dob"
                  type="date"
                  value={form.dob}
                  onChange={(e) => update("dob", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="int-phone" className={labelClass}>{t("intake.phone")}</label>
                <input
                  id="int-phone"
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="int-email" className={labelClass}>{t("intake.email")}</label>
              <input
                id="int-email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={sectionTitle}>{t("newClient.section.address")}</h2>
            <div>
              <label htmlFor="int-address1" className={labelClass}>{t("intake.street")}</label>
              <input
                id="int-address1"
                value={form.address_line1}
                onChange={(e) => update("address_line1", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="int-address2" className={labelClass}>{t("intake.aptUnit")}</label>
              <input
                id="int-address2"
                value={form.address_line2}
                onChange={(e) => update("address_line2", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="int-city" className={labelClass}>{t("intake.city")}</label>
                <input
                  id="int-city"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="int-zip" className={labelClass}>{t("intake.zip")}</label>
                <input
                  id="int-zip"
                  value={form.zip}
                  onChange={(e) => update("zip", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={sectionTitle}>{t("newClient.section.id")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="int-id-type" className={labelClass}>{t("intake.idType")}</label>
                <select
                  id="int-id-type"
                  value={form.id_type}
                  onChange={(e) => update("id_type", e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t("common.selectEllipsis")}</option>
                  {ID_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="int-id-number" className={labelClass}>{t("intake.idNumber")}</label>
                <input
                  id="int-id-number"
                  value={form.photo_id_number}
                  onChange={(e) => update("photo_id_number", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={sectionTitle}>{t("newClient.section.household")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="int-income" className={labelClass}>{t("intake.monthlyIncome")}</label>
                <input
                  id="int-income"
                  type="number"
                  min={0}
                  value={form.monthly_income}
                  onChange={(e) => update("monthly_income", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="int-snap" className={labelClass}>{t("intake.snap")}</label>
                <input
                  id="int-snap"
                  type="number"
                  min={0}
                  value={form.food_stamps_amount}
                  onChange={(e) => update("food_stamps_amount", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="int-dietary" className={labelClass}>{t("intake.dietaryPref")}</label>
              <select
                id="int-dietary"
                value={form.dietary_preference}
                onChange={(e) => update("dietary_preference", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("common.selectEllipsis")}</option>
                {DIETARY_PREFERENCES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="int-ethnicity" className={labelClass}>{t("intake.ethnicity")}</label>
                <input
                  id="int-ethnicity"
                  value={form.ethnicity}
                  onChange={(e) => update("ethnicity", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="int-country" className={labelClass}>{t("intake.countryOfOrigin")}</label>
                <input
                  id="int-country"
                  value={form.country_of_origin}
                  onChange={(e) => update("country_of_origin", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <h2 className={sectionTitle}>{t("newClient.section.members")}</h2>
              <button
                type="button"
                onClick={addMember}
                className="text-xs text-[var(--color-accent)] font-medium hover:underline"
              >
                {t("intake.addMember")}
              </button>
            </div>

            {members.length === 0 && (
              <p className="text-xs text-[var(--color-text-dim)]">{t("newClient.householdNote")}</p>
            )}

            {members.map((m, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label={t("intake.memberFirstName")}
                    placeholder={t("intake.memberFirstName")}
                    value={m.first_name}
                    onChange={(e) => updateMember(i, "first_name", e.target.value)}
                    className={inputClass}
                  />
                  <input
                    aria-label={t("intake.memberLastName")}
                    placeholder={t("intake.memberLastName")}
                    value={m.last_name}
                    onChange={(e) => updateMember(i, "last_name", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label={t("intake.dob")}
                    type="date"
                    value={m.dob}
                    onChange={(e) => updateMember(i, "dob", e.target.value)}
                    className={inputClass}
                  />
                  <input
                    aria-label={t("intake.memberRelationship")}
                    placeholder={t("intake.memberRelationship")}
                    value={m.relationship}
                    onChange={(e) => updateMember(i, "relationship", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  className="text-xs text-red-600 hover:underline"
                >
                  {t("intake.remove")}
                </button>
              </div>
            ))}
          </div>


          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium py-3 disabled:opacity-50"
          >
            {saving ? t("newClient.saving") : t("newClient.submit")}
          </button>
        </form>
      </div>
    </main>
  );
}
