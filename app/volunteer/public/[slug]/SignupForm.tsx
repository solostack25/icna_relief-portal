"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimeInTz } from "@/lib/volunteer";
import {
  ContactFields,
  DemographicFields,
  WaiverBlock,
  emptyProfile,
  emptyWaiver,
  profilePayload,
  volInputClass,
  volLabelClass,
  type ProfileState,
} from "@/components/volunteer/VolunteerFormParts";

type Slot = {
  id: string;
  slot_type: "shift" | "item";
  label: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number;
  spots_remaining: number;
};

const PROFILE_KEY = "icna_volunteer_profile";

export default function SignupForm({
  slots,
  timezone,
  waiverText,
  source,
}: {
  slots: Slot[];
  timezone: string;
  waiverText: string;
  source: "portal" | "qr";
}) {
  const router = useRouter();
  const [slotId, setSlotId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  const [waiver, setWaiver] = useState(emptyWaiver);
  const [signWaiverNow, setSignWaiverNow] = useState(true);
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string; waiverOnFile: boolean }[]>([]);

  // Returning volunteers on the same phone don't retype everything.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile({ ...emptyProfile, ...JSON.parse(saved) });
    } catch {}
  }, []);

  const slot = slots.find((s) => s.id === slotId) ?? null;
  const isShift = slot?.slot_type === "shift";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setError(null);
    if (isShift && signWaiverNow && (!waiver.agreed || !waiver.signature.trim())) {
      setError("Check the box and type your name to sign the waiver — or tick “sign at check-in”.");
      return;
    }
    setSubmitting(true);

    const res = await fetch("/api/volunteer/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot_id: slot.id,
        ...profilePayload(profile),
        name: `${profile.first_name} ${profile.last_name}`.trim(),
        qty: slot.slot_type === "item" ? Number(qty) || 1 : 1,
        notes: notes || undefined,
        waiver: isShift && signWaiverNow ? waiver : undefined,
        source,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
    setDone((d) => [...d, { label: slot.label, waiverOnFile: !!data.waiver_on_file }]);
    setSlotId(null);
    setNotes("");
    setQty("1");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {done.length > 0 && (
        <div className="rounded-xl border border-green-600/30 bg-green-600/5 p-4 space-y-1">
          {done.map((d, i) => (
            <p key={i} className="text-sm font-medium text-green-800">
              ✓ You're signed up for {d.label}
            </p>
          ))}
          <p className="text-xs text-[var(--color-text-dim)] pt-1">
            When you arrive, scan the check-in QR code at the volunteer table with your phone.
            {done.some((d) => !d.waiverOnFile) ? " You'll sign the volunteer waiver then." : ""}
          </p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-medium mb-3">{done.length ? "Sign up for another slot" : "Pick a slot"}</h2>
        <div className="space-y-2">
          {slots.map((s) => {
            const full = s.spots_remaining <= 0;
            const selected = s.id === slotId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={full}
                onClick={() => setSlotId(selected ? null : s.id)}
                className={
                  "w-full text-left rounded-xl border p-4 transition " +
                  (selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]/50") +
                  (full ? " opacity-50 cursor-not-allowed" : "")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    {s.slot_type === "shift" && s.start_time && s.end_time && (
                      <div className="text-xs text-[var(--color-text-dim)]">
                        {formatTimeInTz(s.start_time, timezone)} – {formatTimeInTz(s.end_time, timezone)}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-text-dim)] shrink-0">
                    {full ? "Full" : `${s.spots_remaining} of ${s.capacity} open`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {slot && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-5">
          <div>
            <h3 className="text-sm font-medium mb-3">Your details</h3>
            <ContactFields value={profile} onChange={setProfile} />
          </div>

          <div className="pt-4 border-t border-[var(--color-border)]">
            <DemographicFields value={profile} onChange={setProfile} />
          </div>

          {slot.slot_type === "item" && slot.capacity > 1 && (
            <div>
              <label className={volLabelClass}>How many?</label>
              <input type="number" min={1} max={slot.spots_remaining} value={qty} onChange={(e) => setQty(e.target.value)} className={volInputClass} />
            </div>
          )}

          <div>
            <label className={volLabelClass}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={volInputClass} />
          </div>

          {isShift && (
            <div className="pt-4 border-t border-[var(--color-border)] space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Volunteer waiver</span>
                <span className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                  <input
                    type="checkbox"
                    checked={!signWaiverNow}
                    onChange={(e) => setSignWaiverNow(!e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  Already signed / sign at check-in
                </span>
              </label>
              {signWaiverNow && (
                <WaiverBlock text={waiverText} value={waiver} onChange={setWaiver} dateOfBirth={profile.date_of_birth} />
              )}
            </div>
          )}

          {error && <p className="text-sm text-[var(--color-dull-red)]">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-[var(--color-accent)] text-white font-medium py-3 text-sm disabled:opacity-50"
          >
            {submitting ? "Signing up…" : `Confirm — ${slot.label}`}
          </button>
        </form>
      )}
    </div>
  );
}
