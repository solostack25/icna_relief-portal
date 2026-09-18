"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

export type FoodBankSettings = {
  food_bank_name: string | null;
  qr_value: string | null;
  qr_image: string | null;
};

// The image shown in the scan modal: an uploaded picture of the food
// bank's printed code wins; otherwise the encoded value is rendered.
export function foodBankQrSrc(s: FoodBankSettings | null): string | null {
  if (!s) return null;
  if (s.qr_image) return s.qr_image;
  if (s.qr_value) return `/api/orlando-automation/qr?text=${encodeURIComponent(s.qr_value)}`;
  return null;
}

const MAX_IMAGE_BYTES = 600 * 1024;

export default function FoodBankQrSettings() {
  const supabase = createClient();
  const [settings, setSettings] = useState<FoodBankSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FoodBankSettings>({ food_bank_name: "", qr_value: "", qr_image: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("live_distribution_settings")
      .select("food_bank_name, qr_value, qr_image")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .maybeSingle();
    setSettings(data ?? null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit() {
    setForm({
      food_bank_name: settings?.food_bank_name ?? "",
      qr_value: settings?.qr_value ?? "",
      qr_image: settings?.qr_image ?? null,
    });
    setError(null);
    setEditing(true);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Upload an image (PNG or JPG) of the food bank's QR code.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 600 KB - crop it to just the QR code, or paste the code's value instead.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, qr_image: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { error: upsertError } = await supabase.from("live_distribution_settings").upsert({
      office_id: ORLANDO_OFFICE_ID,
      food_bank_name: form.food_bank_name?.trim() || null,
      qr_value: form.qr_value?.trim() || null,
      qr_image: form.qr_image || null,
      updated_by: employee?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setEditing(false);
    load();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const preview = foodBankQrSrc(editing ? form : settings);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-medium">Food bank QR code</h2>
          <p className="text-xs text-[var(--color-text-dim)]">
            Shown on every scan so it can be scanned into the food bank&apos;s own system
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-border)] hover:border-[var(--color-accent)]"
          >
            {settings ? "Edit" : "Set up"}
          </button>
        )}
      </div>

      {!editing ? (
        preview ? (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Food bank QR code" className="h-24 w-24 object-contain bg-white rounded-lg border border-[var(--color-border)]" />
            <p className="text-sm">{settings?.food_bank_name ?? "Food bank"}</p>
          </div>
        ) : (
          <p className="text-sm text-amber-700">
            Not set up yet - the scan modal won&apos;t have a food bank code to show until it is.
          </p>
        )
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Food bank name</label>
            <input
              value={form.food_bank_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, food_bank_name: e.target.value }))}
              placeholder="e.g. Second Harvest Food Bank of Central Florida"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Upload a picture of their QR code</label>
            <input type="file" accept="image/*" onChange={onFile} className="text-sm" />
            {form.qr_image && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, qr_image: null }))}
                className="ml-3 text-xs text-[#B55139] hover:underline"
              >
                Remove image
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
              …or paste the value the QR code contains (used only when no image is uploaded)
            </label>
            <textarea
              value={form.qr_value ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, qr_value: e.target.value }))}
              rows={2}
              className={inputClass}
            />
          </div>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="QR preview" className="h-32 w-32 object-contain bg-white rounded-lg border border-[var(--color-border)]" />
          )}
          {error && <p className="text-sm text-[#B55139]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-[var(--color-border)] text-sm font-medium px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
