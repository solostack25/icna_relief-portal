"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogServiceButton({
  clientId,
  programSlug,
  buttonLabel,
  modalTitle,
  subtitle,
}: {
  clientId: string;
  programSlug: "hunger-prevention" | "drs" | "rsce";
  buttonLabel: string;
  modalTitle: string;
  subtitle?: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function closeModal() {
    setOpen(false);
    setNotes("");
    setSuccess(false);
  }

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { error } = await supabase.from("client_service_log").insert({
      client_id: clientId,
      program_slug: programSlug,
      employee_id: employee?.id ?? null,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (!error) setSuccess(true);
  }

  function handleDone() {
    closeModal();
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium px-4 py-2 hover:bg-[var(--color-accent)]/10"
      >
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`log-service-title-${programSlug}`}
            className="relative w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            {success ? (
              <div className="text-center py-6">
                <p className="text-base font-medium mb-2">Logged.</p>
                <p className="text-xs text-[var(--color-text-dim)] mb-6">
                  Saved to this client&apos;s record.
                </p>
                <button
                  onClick={handleDone}
                  className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-6 py-2"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleLog}>
                <div className="flex items-center justify-between mb-1">
                  <h3 id={`log-service-title-${programSlug}`} className="text-sm font-semibold">
                    {modalTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label="Close"
                    className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] text-sm"
                  >
                    ✕
                  </button>
                </div>
                {subtitle && (
                  <p className="text-xs text-[var(--color-text-dim)] mb-4">{subtitle}</p>
                )}

                <label
                  htmlFor={`log-service-notes-${programSlug}`}
                  className="block text-xs text-[var(--color-text-dim)] mb-1"
                >
                  Notes (optional)
                </label>
                <textarea
                  id={`log-service-notes-${programSlug}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none resize-none mb-4"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 rounded-lg border border-[var(--color-border)] text-sm font-medium px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Log It"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
