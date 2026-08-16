"use client";

import { useEffect, useState } from "react";

type ColorEntry = { name: string; hex: string; usage: string };
type FontEntry = { role: string; family: string };

export default function BrandGuidelinesClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [colors, setColors] = useState<ColorEntry[]>([]);
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [logoUsageNotes, setLogoUsageNotes] = useState("");
  const [voiceTone, setVoiceTone] = useState("");
  const [dos, setDos] = useState<string[]>([]);
  const [donts, setDonts] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/marketing/fliers/brand-guidelines")
      .then((r) => r.json())
      .then((d) => {
        const g = d.guidelines;
        if (!g) return;
        setColors(g.colors ?? []);
        setFonts(g.fonts ?? []);
        setLogoUsageNotes(g.logo_usage_notes ?? "");
        setVoiceTone(g.voice_tone ?? "");
        setDos(g.dos ?? []);
        setDonts(g.donts ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch("/api/marketing/fliers/brand-guidelines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colors, fonts, logoUsageNotes, voiceTone, dos, donts }),
    });
    setSaving(false);
    setSaveMsg(res.ok ? "Saved" : "Failed to save");
  };

  const sectionClass = "rounded-xl border p-6 mb-6";
  const sectionStyle = { borderColor: "var(--portal-border, #e5ddd0)", background: "white" };
  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none";
  const inputStyle = { borderColor: "var(--portal-border, #e5ddd0)" };
  const labelClass = "block text-xs font-medium mb-1 text-gray-500";

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;

  return (
    <div>
      {/* Colors */}
      <div className={sectionClass} style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3">Color Palette</h2>
        <div className="space-y-2 mb-3">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={c.hex}
                onChange={(e) => setColors((prev) => prev.map((x, idx) => (idx === i ? { ...x, hex: e.target.value } : x)))}
                className="w-9 h-9 rounded border cursor-pointer shrink-0"
              />
              <input
                className={inputClass}
                style={{ ...inputStyle, width: 140 }}
                placeholder="Name"
                value={c.name}
                onChange={(e) => setColors((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                className={inputClass}
                style={{ ...inputStyle, width: 90, flexShrink: 0 }}
                placeholder="#hex"
                value={c.hex}
                onChange={(e) => setColors((prev) => prev.map((x, idx) => (idx === i ? { ...x, hex: e.target.value } : x)))}
              />
              <input
                className={inputClass}
                style={inputStyle}
                placeholder="Usage notes (e.g. primary accent, headers)"
                value={c.usage}
                onChange={(e) => setColors((prev) => prev.map((x, idx) => (idx === i ? { ...x, usage: e.target.value } : x)))}
              />
              <button className="text-gray-400 text-sm shrink-0" onClick={() => setColors((prev) => prev.filter((_, idx) => idx !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          className="text-xs font-medium"
          style={{ color: "var(--portal-emerald, #1F6F54)" }}
          onClick={() => setColors((prev) => [...prev, { name: "", hex: "#000000", usage: "" }])}
        >
          + Add color
        </button>
      </div>

      {/* Fonts */}
      <div className={sectionClass} style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3">Typography</h2>
        <div className="space-y-2 mb-3">
          {fonts.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputClass}
                style={{ ...inputStyle, width: 160 }}
                placeholder="Role (e.g. heading)"
                value={f.role}
                onChange={(e) => setFonts((prev) => prev.map((x, idx) => (idx === i ? { ...x, role: e.target.value } : x)))}
              />
              <input
                className={inputClass}
                style={inputStyle}
                placeholder="Font family"
                value={f.family}
                onChange={(e) => setFonts((prev) => prev.map((x, idx) => (idx === i ? { ...x, family: e.target.value } : x)))}
              />
              <button className="text-gray-400 text-sm shrink-0" onClick={() => setFonts((prev) => prev.filter((_, idx) => idx !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          className="text-xs font-medium"
          style={{ color: "var(--portal-emerald, #1F6F54)" }}
          onClick={() => setFonts((prev) => [...prev, { role: "", family: "" }])}
        >
          + Add font
        </button>
      </div>

      {/* Logo usage */}
      <div className={sectionClass} style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3">Logo Usage</h2>
        <label className={labelClass}>Placement, clear space, size minimums, what&apos;s never allowed</label>
        <textarea className={inputClass} style={inputStyle} rows={4} value={logoUsageNotes} onChange={(e) => setLogoUsageNotes(e.target.value)} />
      </div>

      {/* Voice & tone */}
      <div className={sectionClass} style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3">Voice & Tone</h2>
        <label className={labelClass}>How fliers should sound — audience, formality, language to avoid</label>
        <textarea className={inputClass} style={inputStyle} rows={4} value={voiceTone} onChange={(e) => setVoiceTone(e.target.value)} />
      </div>

      {/* Do's and Don'ts */}
      <div className={sectionClass} style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3">Do&apos;s</h2>
        <BulletListEditor items={dos} onChange={setDos} placeholder="e.g. Always include the ICNA Relief logo bottom-right" />
      </div>
      <div className={sectionClass} style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3">Don&apos;ts</h2>
        <BulletListEditor items={donts} onChange={setDonts} placeholder="e.g. Never stretch or recolor the logo" />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
        style={{ background: "var(--portal-emerald, #1F6F54)" }}
      >
        {saving ? "Saving..." : "Save Guidelines"}
      </button>
      {saveMsg && <span className="ml-3 text-xs text-gray-500">{saveMsg}</span>}
    </div>
  );
}

function BulletListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <div>
      <div className="space-y-2 mb-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--portal-border, #e5ddd0)" }}
              value={item}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))}
            />
            <button className="text-gray-400 text-sm shrink-0" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        className="text-xs font-medium"
        style={{ color: "var(--portal-emerald, #1F6F54)" }}
        onClick={() => onChange([...items, ""])}
      >
        + Add
      </button>
    </div>
  );
}
