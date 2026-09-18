"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";

type HouseholdMember = {
  id: string;
  first_name: string;
  last_name: string | null;
  dob: string;
  relationship: string | null;
  gender: string | null;
};

const RELATIONSHIP_KEYS = [
  "household.rel.spouse",
  "household.rel.child",
  "household.rel.parent",
  "household.rel.sibling",
  "household.rel.grandchild",
  "household.rel.grandparent",
  "household.rel.other",
];

function ageAsOf(dob: string, referenceDate: Date) {
  const birth = new Date(dob + "T00:00:00");
  let age = referenceDate.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    referenceDate.getMonth() > birth.getMonth() ||
    (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

const emptyForm = {
  firstName: "",
  lastName: "",
  dob: "",
  relationship: "",
  gender: "",
};

export default function HouseholdMembers({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const { t } = useLanguage();

  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("household_members")
      .select("id, first_name, last_name, dob, relationship, gender")
      .eq("client_id", clientId)
      .order("dob", { ascending: false });
    setMembers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      setEmployeeId(employee?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Let keyboard users close the modal with Escape, same as the visible ✕ button.
  useEffect(() => {
    if (!modalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, saving]);

  function openModal() {
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim()) {
      setError(t("household.errorFirstName"));
      return;
    }
    if (!form.dob) {
      setError(t("household.errorDob"));
      return;
    }

    setSaving(true);

    const { data: inserted, error: insertError } = await supabase
      .from("household_members")
      .insert({
        client_id: clientId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim() || null,
        dob: form.dob,
        relationship: form.relationship || null,
        gender: form.gender || null,
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    await logAudit(supabase, employeeId, "add_household_member", "household_member", inserted?.id, {
      client_id: clientId,
      first_name: form.firstName.trim(),
    });

    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function handleRemove(memberId: string) {
    if (!confirm(t("household.confirmRemove"))) return;
    await supabase.from("household_members").delete().eq("id", memberId);
    await logAudit(supabase, employeeId, "remove_household_member", "household_member", memberId, {
      client_id: clientId,
    });
    load();
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium">{t("household.title")}</h2>
        <button
          onClick={openModal}
          className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:border-[var(--color-accent)]"
        >
          {t("household.addMember")}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-dim)]">{t("common.loading")}</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">{t("household.none")}</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 first:border-0 first:pt-0"
            >
              <div>
                <p className="text-sm font-medium">
                  {m.first_name} {m.last_name}
                </p>
                <p className="text-xs text-[var(--color-text-dim)]">
                  {m.relationship ?? t("household.relationshipNotSet")} ·{" "}
                  {t("household.age", { n: ageAsOf(m.dob, new Date()) })} · {t("profile.dob")}{" "}
                  {m.dob}
                  {m.gender ? ` · ${m.gender}` : ""}
                </p>
              </div>
              <button
                onClick={() => handleRemove(m.id)}
                className="text-xs text-red-600 hover:underline shrink-0"
              >
                {t("household.remove")}
              </button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="household-modal-title"
            className="w-full max-w-sm rounded-xl bg-[var(--color-input-bg)] border border-[var(--color-border)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="household-modal-title" className="text-sm font-semibold">
                {t("household.modalTitle")}
              </h3>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hh-first-name" className="block text-xs mb-1 text-[var(--color-text-dim)]">
                    {t("household.firstName")}
                  </label>
                  <input
                    id="hh-first-name"
                    autoFocus
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label htmlFor="hh-last-name" className="block text-xs mb-1 text-[var(--color-text-dim)]">
                    {t("household.lastName")}
                  </label>
                  <input
                    id="hh-last-name"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="hh-dob" className="block text-xs mb-1 text-[var(--color-text-dim)]">
                  {t("household.dobLabel")}
                </label>
                <input
                  id="hh-dob"
                  type="date"
                  value={form.dob}
                  onChange={(e) => setForm({ ...form, dob: e.target.value })}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hh-relationship" className="block text-xs mb-1 text-[var(--color-text-dim)]">
                    {t("household.relationship")}
                  </label>
                  <select
                    id="hh-relationship"
                    value={form.relationship}
                    onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] bg-[var(--color-input-bg)]"
                  >
                    <option value="">{t("common.selectEllipsis")}</option>
                    {RELATIONSHIP_KEYS.map((key) => (
                      <option key={key} value={t(key)}>
                        {t(key)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="hh-gender" className="block text-xs mb-1 text-[var(--color-text-dim)]">
                    {t("household.gender")}
                  </label>
                  <select
                    id="hh-gender"
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] bg-[var(--color-input-bg)]"
                  >
                    <option value="">{t("common.selectEllipsis")}</option>
                    <option value={t("household.male")}>{t("household.male")}</option>
                    <option value={t("household.female")}>{t("household.female")}</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 text-sm font-medium rounded-lg px-4 py-2.5 border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                >
                  {t("household.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 text-sm font-medium rounded-lg px-4 py-2.5 bg-[var(--color-accent-solid)] text-white disabled:opacity-50"
                >
                  {saving ? t("household.saving") : t("household.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
