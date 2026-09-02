"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SUGGESTED_CATEGORIES = ["Rent Assistance", "Utility Assistance", "Medical Assistance", "Food Assistance", "Emergency Assistance", "Other"];

export default function ApplyForZakatButton({
  clientId,
  applicantName,
  applicantPhone,
  applicantAddress,
  householdSize,
}: {
  clientId: string;
  applicantName: string;
  applicantPhone: string | null;
  applicantAddress: string | null;
  householdSize: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [amountRequested, setAmountRequested] = useState("");
  const [reason, setReason] = useState("");
  const [showPayee, setShowPayee] = useState(false);
  const [payeeName, setPayeeName] = useState("");
  const [payeeAddress, setPayeeAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ application_number: string } | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function closeModal() {
    setOpen(false);
    setCategory("");
    setAmountRequested("");
    setReason("");
    setShowPayee(false);
    setPayeeName("");
    setPayeeAddress("");
    setError(null);
    setSuccess(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/irfas/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          applicant_name: applicantName,
          applicant_phone: applicantPhone,
          applicant_address: applicantAddress,
          household_size: householdSize,
          category: category.trim(),
          amount_requested: Number(amountRequested),
          reason: reason.trim() || null,
          payee_name: showPayee ? payeeName.trim() || null : null,
          payee_address: showPayee ? payeeAddress.trim() || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSuccess({ application_number: data.application.application_number });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
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
        Apply for Zakat Assistance
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zakat-apply-title"
            className="relative w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            {success ? (
              <div className="text-center py-6">
                <p className="text-base font-medium mb-2">Submitted.</p>
                <p className="text-xs text-[var(--color-text-dim)] mb-1 font-mono">{success.application_number}</p>
                <p className="text-xs text-[var(--color-text-dim)] mb-6">
                  Every configured approver has been emailed a review link.
                </p>
                <button
                  onClick={handleDone}
                  className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-6 py-2"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="flex items-center justify-between mb-1">
                  <h3 id="zakat-apply-title" className="text-sm font-semibold">
                    Apply for Zakat Assistance
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
                <p className="text-xs text-[var(--color-text-dim)] mb-4">
                  For {applicantName} - applicant info comes from their client record, no need to re-enter it here.
                </p>

                <label htmlFor="zakat-category" className="block text-xs text-[var(--color-text-dim)] mb-1">
                  Category
                </label>
                <input
                  id="zakat-category"
                  list="zakat-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none mb-3"
                />
                <datalist id="zakat-categories">
                  {SUGGESTED_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>

                <label htmlFor="zakat-amount" className="block text-xs text-[var(--color-text-dim)] mb-1">
                  Amount Requested
                </label>
                <input
                  id="zakat-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountRequested}
                  onChange={(e) => setAmountRequested(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none mb-3"
                />

                <label htmlFor="zakat-reason" className="block text-xs text-[var(--color-text-dim)] mb-1">
                  Reason / Notes (optional)
                </label>
                <textarea
                  id="zakat-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none resize-none mb-3"
                />

                {!showPayee ? (
                  <button
                    type="button"
                    onClick={() => setShowPayee(true)}
                    className="text-xs text-[var(--color-accent)] font-medium mb-4"
                  >
                    + Pay someone other than the applicant (e.g. a landlord)
                  </button>
                ) : (
                  <div className="mb-4 pt-3 border-t border-[var(--color-border)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">Check Payee</span>
                      <button type="button" onClick={() => setShowPayee(false)} className="text-xs text-[var(--color-text-dim)]">
                        Remove
                      </button>
                    </div>
                    <input
                      value={payeeName}
                      onChange={(e) => setPayeeName(e.target.value)}
                      placeholder="Payee name"
                      className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none mb-2"
                    />
                    <input
                      value={payeeAddress}
                      onChange={(e) => setPayeeAddress(e.target.value)}
                      placeholder="Payee address"
                      className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
                    />
                  </div>
                )}

                {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

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
                    disabled={submitting || !category.trim() || !amountRequested}
                    className="flex-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
                  >
                    {submitting ? "Submitting…" : "Submit for Approval"}
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
