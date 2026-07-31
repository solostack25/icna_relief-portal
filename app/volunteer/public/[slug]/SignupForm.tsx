"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Slot = {
  id: string;
  slot_type: "shift" | "item";
  label: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number;
  spots_remaining: number;
};

export default function SignupForm({ slot }: { slot: Slot }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", phone: "", qty: "1", notes: "" });

  const full = slot.spots_remaining <= 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/volunteer/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot_id: slot.id,
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        qty: slot.slot_type === "item" ? Number(form.qty) || 1 : 1,
        notes: form.notes || undefined,
        source: "portal",
      }),
    });

    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    setDone(true);
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  if (done) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
        <p className="text-sm font-medium text-green-700">
          You're signed up for {slot.label} 🎉 Check your email for details.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{slot.label}</div>
          <div className="text-xs text-[var(--color-text-dim)]">
            {full ? "Full" : `${slot.spots_remaining} of ${slot.capacity} open`}
          </div>
        </div>
        {!full && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg px-4 py-2 shrink-0"
          >
            {open ? "Cancel" : "Sign Up"}
          </button>
        )}
      </div>

      {open && !full && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            required
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputClass}
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputClass}
          />
          <input
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className={inputClass}
          />
          {slot.slot_type === "item" && slot.capacity > 1 && (
            <input
              type="number"
              min={1}
              max={slot.spots_remaining}
              placeholder="Quantity"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              className={inputClass}
            />
          )}
          <textarea
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className={inputClass}
          />
          {error && <p className="text-sm text-[#B55139]">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50"
          >
            {submitting ? "Signing up..." : "Confirm Signup"}
          </button>
        </form>
      )}
    </div>
  );
}
