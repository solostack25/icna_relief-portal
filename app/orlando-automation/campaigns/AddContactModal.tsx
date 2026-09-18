"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  organization: "",
  listTag: "",
  notes: "",
};

export default function AddContactModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim()) {
      setError("First name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { error: insertError } = await supabase.from("campaign_contacts").insert({
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      organization: form.organization.trim() || null,
      list_tag: form.listTag.trim() || null,
      notes: form.notes.trim() || null,
      created_by: employee?.id ?? null,
      office_id: ORLANDO_OFFICE_ID,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    onAdded();
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-contact-modal-title"
        className="w-full max-w-sm rounded-xl bg-[var(--color-input-bg)] border border-[var(--color-border)] p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="add-contact-modal-title" className="text-sm font-semibold">
            Add Contact
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="firstName" className="block text-xs text-[var(--color-text-dim)] mb-1">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-xs text-[var(--color-text-dim)] mb-1">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs text-[var(--color-text-dim)] mb-1">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 (713) 555-0100"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs text-[var(--color-text-dim)] mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="organization" className="block text-xs text-[var(--color-text-dim)] mb-1">
              Organization
            </label>
            <input
              id="organization"
              type="text"
              value={form.organization}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="listTag" className="block text-xs text-[var(--color-text-dim)] mb-1">
              List / segment tag
            </label>
            <input
              id="listTag"
              type="text"
              value={form.listTag}
              onChange={(e) => setForm({ ...form, listTag: e.target.value })}
              placeholder="e.g. Ramadan 2027, Major Donors"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-xs text-[var(--color-text-dim)] mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--color-border)] text-sm font-medium px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving…" : "Add Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
