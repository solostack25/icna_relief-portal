"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { foodBankQrSrc } from "@/lib/orlandoAutomation/foodBankQr";

// The client's ID number in the local food bank's own system. Saved on the
// client record and shown as a QR code - the same code that pops up during
// Live Distribution so it can be scanned into the food bank's system.
export default function FoodBankIdCard({ clientId, initialValue }: { clientId: string; initialValue: string | null }) {
  const supabase = createClient();
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(initialValue ?? "");
  const [editing, setEditing] = useState(!initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const next = value.trim() || null;
    const { error: updateError } = await supabase.from("clients").update({ food_bank_client_id: next }).eq("id", clientId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };
    await logAudit(supabase, employee?.id ?? null, "set_food_bank_id", "client", clientId, { food_bank_client_id: next });
    setSaved(next ?? "");
    setEditing(!next);
  }

  const qr = foodBankQrSrc(saved);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium">Food Bank ID</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-border)] hover:border-[var(--color-accent)]"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-dim)]">
            The client&apos;s ID number from the food bank. It&apos;s turned into a QR code that pops up when they&apos;re scanned at a live
            distribution.
          </p>
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              placeholder="Food bank ID number"
              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & generate QR"}
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => {
                  setValue(saved);
                  setEditing(false);
                }}
                className="rounded-lg border border-[var(--color-border)] text-sm font-medium px-3 py-2"
              >
                Cancel
              </button>
            )}
          </div>
          {error && <p className="text-sm text-[#B55139]">{error}</p>}
        </div>
      ) : (
        qr && (
          <div className="flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`Food bank QR code for ID ${saved}`} className="h-32 w-32 bg-white rounded-lg border border-[var(--color-border)]" />
            <div>
              <p className="text-xs text-[var(--color-text-dim)]">Food bank ID</p>
              <p className="text-lg font-semibold tracking-wide" dir="ltr">
                {saved}
              </p>
            </div>
          </div>
        )
      )}
    </section>
  );
}
