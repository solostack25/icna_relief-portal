"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Signup = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  qty: number;
  notes: string | null;
  source: string;
  created_at: string;
};

type Slot = {
  id: string;
  slot_type: "shift" | "item";
  label: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number;
  claimed: number;
  spots_remaining: number;
  signups: Signup[];
};

export default function EventManager({
  eventId,
  slug,
  isPublished,
  initialSlots,
}: {
  eventId: string;
  slug: string;
  isPublished: boolean;
  initialSlots: Slot[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [showAddSlot, setShowAddSlot] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  const [slotForm, setSlotForm] = useState({
    slot_type: "shift" as "shift" | "item",
    label: "",
    start_time: "",
    end_time: "",
    capacity: "1",
  });

  const publicPath = `/volunteer/public/${slug}`;

  async function togglePublish() {
    setPublishing(true);
    setPublishError(null);

    const { error } = await supabase
      .from("volunteer_events")
      .update({ is_published: !isPublished })
      .eq("id", eventId);

    setPublishing(false);

    if (error) {
      setPublishError(error.message);
      return;
    }
    router.refresh();
  }

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    setSlotError(null);

    if (!slotForm.label.trim()) {
      setSlotError("Add a label — a time range or what's needed.");
      return;
    }

    setSavingSlot(true);

    const { error } = await supabase.from("volunteer_slots").insert({
      event_id: eventId,
      slot_type: slotForm.slot_type,
      label: slotForm.label.trim(),
      start_time: slotForm.slot_type === "shift" && slotForm.start_time ? slotForm.start_time : null,
      end_time: slotForm.slot_type === "shift" && slotForm.end_time ? slotForm.end_time : null,
      capacity: Number(slotForm.capacity) || 1,
    });

    setSavingSlot(false);

    if (error) {
      setSlotError(error.message);
      return;
    }

    setSlotForm({ slot_type: "shift", label: "", start_time: "", end_time: "", capacity: "1" });
    setShowAddSlot(false);
    router.refresh();
  }

  async function handleDeleteSlot(slotId: string) {
    if (!confirm("Delete this slot? This also removes any signups on it.")) return;
    await supabase.from("volunteer_slots").delete().eq("id", slotId);
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  return (
    <div className="space-y-6">
      {/* Publish + link */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium">Visibility</h2>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              {isPublished
                ? "Live — visible on the public signup page and any WordPress embed."
                : "Draft — only your team can see this. Publish once slots are ready."}
            </p>
          </div>
          <button
            onClick={togglePublish}
            disabled={publishing}
            className={
              "text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 " +
              (isPublished
                ? "border border-[var(--color-border)] text-[var(--color-text-dim)]"
                : "bg-[var(--color-accent)] text-white")
            }
          >
            {publishing ? "Saving..." : isPublished ? "Unpublish" : "Publish"}
          </button>
        </div>
        {publishError && <p className="text-sm text-[#B55139]">{publishError}</p>}

        <div className="mt-2 pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-dim)] mb-1">
            Public link (goes live once the public signup page ships) — this slug is also the key the WordPress shortcode will use:
          </p>
          <code className="text-xs bg-black/[0.03] rounded px-2 py-1 inline-block">{publicPath}</code>
        </div>
      </section>

      {/* Slots */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Slots</h2>
          <button
            onClick={() => setShowAddSlot((v) => !v)}
            className="text-sm text-[var(--color-accent)] font-medium"
          >
            {showAddSlot ? "Cancel" : "+ Add Slot"}
          </button>
        </div>

        {showAddSlot && (
          <form onSubmit={handleAddSlot} className="space-y-3 mb-6 pb-6 border-b border-[var(--color-border)]">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={slotForm.slot_type}
                  onChange={(e) => setSlotForm((f) => ({ ...f, slot_type: e.target.value as "shift" | "item" }))}
                  className={inputClass}
                >
                  <option value="shift">Shift (time-based)</option>
                  <option value="item">Item (bring/donate)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Capacity (spots)</label>
                <input
                  type="number"
                  min={1}
                  value={slotForm.capacity}
                  onChange={(e) => setSlotForm((f) => ({ ...f, capacity: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Label *</label>
              <input
                required
                value={slotForm.label}
                onChange={(e) => setSlotForm((f) => ({ ...f, label: e.target.value }))}
                className={inputClass}
                placeholder={slotForm.slot_type === "shift" ? "9:00 AM – 12:00 PM" : "Bring napkins (2 needed)"}
              />
            </div>

            {slotForm.slot_type === "shift" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Start</label>
                  <input
                    type="datetime-local"
                    value={slotForm.start_time}
                    onChange={(e) => setSlotForm((f) => ({ ...f, start_time: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>End</label>
                  <input
                    type="datetime-local"
                    value={slotForm.end_time}
                    onChange={(e) => setSlotForm((f) => ({ ...f, end_time: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {slotError && <p className="text-sm text-[#B55139]">{slotError}</p>}

            <button
              type="submit"
              disabled={savingSlot}
              className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50"
            >
              {savingSlot ? "Adding..." : "Add Slot"}
            </button>
          </form>
        )}

        {initialSlots.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            No slots yet — add at least one before publishing.
          </p>
        ) : (
          <div className="space-y-3">
            {initialSlots.map((slot) => (
              <div key={slot.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setExpandedSlot((v) => (v === slot.id ? null : slot.id))}
                    className="text-left flex-1"
                  >
                    <div className="text-sm font-medium">{slot.label}</div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {slot.slot_type === "shift" ? "Shift" : "Item"} · {slot.spots_remaining}/{slot.capacity} open
                      {slot.signups.length > 0 ? ` · ${slot.signups.length} signup${slot.signups.length === 1 ? "" : "s"}` : ""}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="text-xs text-[#B55139] ml-3"
                  >
                    Delete
                  </button>
                </div>

                {expandedSlot === slot.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                    {slot.signups.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-dim)]">No signups yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {slot.signups.map((s) => (
                          <div key={s.id} className="text-xs">
                            <span className="font-medium">{s.name}</span>{" "}
                            <span className="text-[var(--color-text-dim)]">
                              · {s.email}{s.phone ? ` · ${s.phone}` : ""}{s.qty > 1 ? ` · qty ${s.qty}` : ""}{s.source === "wordpress" ? " · via WordPress" : ""}
                            </span>
                            {s.notes && <div className="text-[var(--color-text-dim)] mt-0.5">"{s.notes}"</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
