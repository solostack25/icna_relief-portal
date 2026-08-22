"use client";

import { useState } from "react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type HourRow = { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean };
type NoteRow = { id?: string; label: string; content: string | null; sort_order: number };

function buildInitialHours(rows: HourRow[]): HourRow[] {
  return DAY_NAMES.map((_, day_of_week) => {
    const existing = rows.find((r) => r.day_of_week === day_of_week);
    return existing ?? { day_of_week, open_time: "09:00", close_time: "17:00", is_closed: day_of_week === 0 || day_of_week === 6 };
  });
}

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(22,48,43,0.15)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 14,
  background: "#fff",
};

export default function OfficeInfoEditorClient({
  officeId,
  initialHours,
  initialNotes,
}: {
  officeId: string;
  initialHours: HourRow[];
  initialNotes: NoteRow[];
}) {
  const [hours, setHours] = useState<HourRow[]>(buildInitialHours(initialHours));
  const [notes, setNotes] = useState<NoteRow[]>(initialNotes.length > 0 ? initialNotes : []);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateHour(day: number, patch: Partial<HourRow>) {
    setHours((prev) => prev.map((h) => (h.day_of_week === day ? { ...h, ...patch } : h)));
  }

  function addNote() {
    setNotes((prev) => [...prev, { label: "", content: "", sort_order: prev.length }]);
  }

  function updateNote(index: number, patch: Partial<NoteRow>) {
    setNotes((prev) => prev.map((n, i) => (i === index ? { ...n, ...patch } : n)));
  }

  function removeNote(index: number) {
    setNotes((prev) => prev.filter((_, i) => i !== index));
  }

  function moveNote(index: number, dir: -1 | 1) {
    setNotes((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/office-info/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          office_id: officeId,
          office_hours: hours,
          notes: notes.filter((n) => n.label.trim().length > 0).map((n, i) => ({ ...n, sort_order: i })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <section className="mb-10">
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Office Hours</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
          The structured weekly grid shown on the site.
        </p>
        <div className="flex flex-col gap-2">
          {hours.map((h) => (
            <div key={h.day_of_week} className="flex items-center gap-3" style={{ opacity: h.is_closed ? 0.55 : 1 }}>
              <span style={{ width: 96, fontSize: 14, fontWeight: 600 }}>{DAY_NAMES[h.day_of_week]}</span>
              <label className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(22,48,43,0.6)" }}>
                <input
                  type="checkbox"
                  checked={h.is_closed}
                  onChange={(e) => updateHour(h.day_of_week, { is_closed: e.target.checked })}
                />
                Closed
              </label>
              {!h.is_closed && (
                <>
                  <input
                    type="time"
                    value={h.open_time ?? ""}
                    onChange={(e) => updateHour(h.day_of_week, { open_time: e.target.value })}
                    style={inputStyle}
                  />
                  <span style={{ color: "rgba(22,48,43,0.4)" }}>to</span>
                  <input
                    type="time"
                    value={h.close_time ?? ""}
                    onChange={(e) => updateHour(h.day_of_week, { close_time: e.target.value })}
                    style={inputStyle}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-1">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Additional Categories</h2>
          <button
            onClick={addNote}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--icna-green, #2F6D46)", color: "#fff" }}
          >
            + Add Category
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
          Anything else this office wants to publish — Food Pantry hours, Health Clinic hours, holiday closures,
          whatever. Name each one however you like; each is free-text.
        </p>

        {notes.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            No additional categories yet.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {notes.map((note, i) => (
            <div key={i} className="rounded-lg border p-3" style={{ borderColor: "rgba(22,48,43,0.1)", background: "#fff" }}>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Category name, e.g. Food Pantry Hours"
                  value={note.label}
                  onChange={(e) => updateNote(i, { label: e.target.value })}
                  style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
                />
                <button onClick={() => moveNote(i, -1)} disabled={i === 0} title="Move up" style={{ opacity: i === 0 ? 0.3 : 1 }}>
                  ↑
                </button>
                <button
                  onClick={() => moveNote(i, 1)}
                  disabled={i === notes.length - 1}
                  title="Move down"
                  style={{ opacity: i === notes.length - 1 ? 0.3 : 1 }}
                >
                  ↓
                </button>
                <button onClick={() => removeNote(i)} title="Remove" style={{ color: "#B3261E" }}>
                  ✕
                </button>
              </div>
              <textarea
                placeholder="Free text — e.g. Wed & Fri 10am-1pm, closed on federal holidays"
                value={note.content ?? ""}
                onChange={(e) => updateNote(i, { content: e.target.value })}
                rows={2}
                style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="text-sm mb-3" style={{ color: "#B3261E" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-semibold px-5 py-2.5 rounded-lg"
          style={{ background: "var(--icna-green, #2F6D46)", color: "#fff", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {savedAt && (
          <span className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            Saved — live on the site now.
          </span>
        )}
      </div>
    </div>
  );
}
