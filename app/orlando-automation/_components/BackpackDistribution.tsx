"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";
import { useAlert } from "@/lib/orlandoAutomation/alert";

type HouseholdMember = {
  id: string;
  first_name: string;
  last_name: string | null;
  dob: string | null;
  relationship: string | null;
};

type Distribution = {
  id: string;
  school_year: string;
  eligible_children_count: number;
  backpacks_distributed: number;
  distributed_at: string;
  notes: string | null;
};

function ageAsOf(dob: string, referenceDate: Date) {
  const birth = new Date(dob + "T00:00:00");
  let age = referenceDate.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    referenceDate.getMonth() > birth.getMonth() ||
    (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// School year runs Aug 1 – Jul 31. Eligibility ages (5-18) are checked as of
// today, not locked to a fixed date — adjust here if ICNA wants a specific
// cutoff (e.g. age as of Sept 1) instead.
function currentSchoolYear() {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export default function BackpackDistribution({
  clientId,
  householdKey = null,
}: {
  clientId: string;
  householdKey?: string | null;
}) {
  const supabase = createClient();
  const { t, tn, locale } = useLanguage();
  const { showAlert } = useAlert();

  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overrideCount, setOverrideCount] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const schoolYear = currentSchoolYear();

  async function load() {
    setLoading(true);

    // Unified-intake households: members are client records sharing
    // household_key. Older clients: the legacy household_members table.
    const { data: memberRows } = householdKey
      ? await supabase
          .from("clients")
          .select("id, first_name, last_name, dob, relationship:relationship_to_main_client")
          .eq("household_key", householdKey)
          .neq("id", clientId)
      : await supabase
          .from("household_members")
          .select("id, first_name, last_name, dob, relationship")
          .eq("client_id", clientId);

    const { data: distRow } = await supabase
      .from("b2s_client_distributions")
      .select("id, school_year, eligible_children_count, backpacks_distributed, distributed_at, notes")
      .eq("client_id", clientId)
      .eq("school_year", schoolYear)
      .maybeSingle();

    setMembers(memberRows ?? []);
    setDistribution(distRow ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, householdKey]);

  const today = new Date();
  const eligibleMembers = members.filter((m) => {
    if (!m.dob) return false;
    const age = ageAsOf(m.dob, today);
    return age >= 5 && age <= 18;
  });

  const eligibleCount = eligibleMembers.length;
  const backpackCount = overrideCount ?? eligibleCount;

  async function handleDistribute() {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { error } = await supabase.from("b2s_client_distributions").insert({
      client_id: clientId,
      employee_id: employee?.id ?? null,
      school_year: schoolYear,
      eligible_children_count: eligibleCount,
      backpacks_distributed: backpackCount,
      notes: notes || null,
    });

    setSaving(false);

    if (error) {
      showAlert(error.message, "error");
      return;
    }

    await logAudit(supabase, employee?.id ?? null, "distribute_backpacks", "client", clientId, {
      school_year: schoolYear,
      eligible_children_count: eligibleCount,
      backpacks_distributed: backpackCount,
    });

    load();
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium">{t("backpack.title")}</h2>
        <span className="text-xs text-[var(--color-text-dim)]">{schoolYear}</span>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-dim)] mt-3">{t("common.loading")}</p>
      ) : distribution ? (
        <div className="mt-3 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-4">
          <p className="text-sm font-medium text-[var(--color-accent)]">
            {tn("backpack.alreadyReceived", distribution.backpacks_distributed, {
              count: distribution.backpacks_distributed,
            })}
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            {new Date(distribution.distributed_at).toLocaleDateString(locale)} ·{" "}
            {tn("backpack.eligibleOnFile", distribution.eligible_children_count, {
              count: distribution.eligible_children_count,
            })}
          </p>
          {distribution.notes && (
            <p className="text-xs text-[var(--color-text-dim)] mt-1">&quot;{distribution.notes}&quot;</p>
          )}
        </div>
      ) : (
        <div className="mt-3">
          {eligibleCount === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">{t("backpack.noEligible")}</p>
          ) : (
            <div className="mb-3">
              <p className="text-xs text-[var(--color-text-dim)] mb-2">
                {t("backpack.eligibleMembers")}
              </p>
              <ul className="text-sm space-y-1">
                {eligibleMembers.map((m) => (
                  <li key={m.id}>
                    {m.first_name} {m.last_name ?? ""}
                    {m.dob ? ` — ${t("backpack.ageLabel", { n: ageAsOf(m.dob, today) })}` : ""}
                    {m.relationship ? ` (${m.relationship})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-end gap-3 mb-3">
            <div>
              <label htmlFor="backpack-count" className="block text-xs mb-1 text-[var(--color-text-dim)]">
                {t("backpack.backpacksToGive")}
              </label>
              <input
                id="backpack-count"
                type="number"
                min={0}
                value={backpackCount}
                onChange={(e) => setOverrideCount(Number(e.target.value))}
                className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            {overrideCount !== null && overrideCount !== eligibleCount && (
              <span className="text-xs text-amber-700">
                {t("backpack.overriding", { n: eligibleCount })}
              </span>
            )}
          </div>

          <input
            aria-label={t("backpack.notePlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("backpack.notePlaceholder")}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] mb-3"
          />


          <button
            onClick={handleDistribute}
            disabled={saving || backpackCount <= 0}
            className="rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {saving ? t("backpack.recording") : tn("backpack.distribute", backpackCount, { n: backpackCount })}
          </button>
        </div>
      )}
    </section>
  );
}
