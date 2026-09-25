"use client";

import { useState } from "react";
import { PUBLIC_WEBSITE_URL, WEBSITE_KINDS, WEBSITE_SERVICES } from "@/lib/publicWebsiteShared";

export type WebsiteListing = {
  is_public: boolean;
  display_name: string | null;
  kind: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  services: string[];
  public_note: string | null;
  geo_source: string | null;
};

const EMPTY: WebsiteListing = {
  is_public: false,
  display_name: "",
  kind: "office",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  email: "",
  services: [],
  public_note: "",
  geo_source: null,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(22,48,43,0.15)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  background: "#fff",
  width: "100%",
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.7)", display: "block", marginBottom: 4 };

export default function WebsiteListingEditor({
  officeId,
  officeName,
  initial,
}: {
  officeId: string;
  officeName: string;
  initial: WebsiteListing | null;
}) {
  const [l, setL] = useState<WebsiteListing>({ ...EMPTY, ...(initial ?? {}) });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const set = (patch: Partial<WebsiteListing>) => {
    setL((prev) => ({ ...prev, ...patch }));
    setMsg(null);
  };
  const toggleService = (id: string) =>
    set({ services: l.services.includes(id) ? l.services.filter((s) => s !== id) : [...l.services, id] });

  const hasAddress = Boolean(l.address1?.trim() && l.city?.trim() && l.state?.trim() && l.zip?.trim());
  const name = l.display_name?.trim() || officeName;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/office-info/website-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ office_id: officeId, ...l }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ tone: "error", text: j.error ?? "Couldn't save. Try again." });
        return;
      }
      if (!l.is_public) setMsg({ tone: "ok", text: "Saved. This office is hidden from the public website." });
      else if (j.refreshed) setMsg({ tone: "ok", text: "Saved and live on the website now." });
      else setMsg({ tone: "warn", text: "Saved. The website will show the change within the hour." });
      if (l.is_public && !j.mapped) setMsg({ tone: "warn", text: "Saved, but we couldn't place this ZIP on the map. Check the ZIP code." });
    } catch {
      setMsg({ tone: "error", text: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="mb-10"
      style={{ background: "#fff", border: "1px solid rgba(22,48,43,0.1)", borderRadius: 14, padding: "20px 22px" }}
      aria-labelledby="website-listing-title"
    >
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 id="website-listing-title" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0 }}>
            Public website listing
          </h2>
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.55)", marginTop: 4 }}>
            Controls how this office appears in “Find help near you”, the map and your state page on{" "}
            <a href={PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer" style={{ color: "var(--portal-emerald)" }}>
              the ICNA Relief website
            </a>
            . Hours come from the hours grid below.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold shrink-0" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={l.is_public} onChange={(e) => set({ is_public: e.target.checked })} />
          Show on website
        </label>
      </div>

      <p
        className="text-sm mb-5"
        style={{ background: "#FFF7E8", border: "1px solid #F2D6A2", borderRadius: 8, padding: "8px 12px", color: "#6B4A10" }}
      >
        Never list transitional housing or domestic violence shelters. Their locations must stay private.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div>
          <label style={labelStyle} htmlFor="wl-name">Name on website</label>
          <input id="wl-name" style={inputStyle} placeholder={officeName} value={l.display_name ?? ""} onChange={(e) => set({ display_name: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="wl-kind">Type</label>
          <select id="wl-kind" style={inputStyle} value={l.kind} onChange={(e) => set({ kind: e.target.value })}>
            {WEBSITE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle} htmlFor="wl-a1">Street address</label>
          <input id="wl-a1" style={inputStyle} value={l.address1 ?? ""} onChange={(e) => set({ address1: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="wl-a2">Suite / unit (optional)</label>
          <input id="wl-a2" style={inputStyle} value={l.address2 ?? ""} onChange={(e) => set({ address2: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="wl-city">City</label>
          <input id="wl-city" style={inputStyle} value={l.city ?? ""} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle} htmlFor="wl-state">State</label>
            <input
              id="wl-state"
              style={inputStyle}
              maxLength={2}
              placeholder="TX"
              value={l.state ?? ""}
              onChange={(e) => set({ state: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="wl-zip">ZIP</label>
            <input
              id="wl-zip"
              style={inputStyle}
              inputMode="numeric"
              maxLength={5}
              value={l.zip ?? ""}
              onChange={(e) => set({ zip: e.target.value.replace(/\D/g, "") })}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="wl-phone">Public phone</label>
          <input id="wl-phone" style={inputStyle} placeholder="(555) 555-0100" value={l.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="wl-email">Public email</label>
          <input id="wl-email" type="email" style={inputStyle} value={l.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
        </div>
      </div>

      <fieldset className="mt-5" style={{ border: 0, padding: 0 }}>
        <legend style={labelStyle}>What people can get here</legend>
        <div className="flex flex-wrap gap-2 mt-1">
          {WEBSITE_SERVICES.map((s) => {
            const on = l.services.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleService(s.id)}
                aria-pressed={on}
                className="text-sm"
                style={{
                  borderRadius: 999,
                  padding: "6px 12px",
                  border: `1px solid ${on ? "var(--portal-emerald, #2F6D46)" : "rgba(22,48,43,0.15)"}`,
                  background: on ? "var(--portal-emerald, #2F6D46)" : "#fff",
                  color: on ? "#fff" : "#16302B",
                }}
              >
                {on ? "✓ " : ""}
                {s.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5">
        <label style={labelStyle} htmlFor="wl-note">
          Short note for visitors (optional, {280 - (l.public_note?.length ?? 0)} characters left)
        </label>
        <input
          id="wl-note"
          style={inputStyle}
          maxLength={280}
          placeholder="e.g. Bring a photo ID. Pantry is at the back entrance."
          value={l.public_note ?? ""}
          onChange={(e) => set({ public_note: e.target.value })}
        />
      </div>

      {l.is_public && (
        <div className="mt-5 text-sm" style={{ background: "#F3F7F4", borderRadius: 10, padding: "12px 14px", color: "#16302B" }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Preview</div>
          {hasAddress ? (
            <>
              <div>
                <b>{name}</b> · {WEBSITE_KINDS.find((k) => k.id === l.kind)?.label}
              </div>
              <div>
                {l.address1}
                {l.address2 ? `, ${l.address2}` : ""}, {l.city}, {l.state} {l.zip}
              </div>
              {l.phone && <div>{l.phone}</div>}
            </>
          ) : (
            <div style={{ color: "#B3261E" }}>Add the street address, city, state and ZIP to show this office on the website.</div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={save}
          disabled={saving || (l.is_public && !hasAddress)}
          className="text-sm font-semibold px-5 py-2.5 rounded-lg"
          style={{ background: "var(--icna-green, #2F6D46)", color: "#fff", opacity: saving || (l.is_public && !hasAddress) ? 0.6 : 1 }}
        >
          {saving ? "Saving..." : "Save website listing"}
        </button>
        {msg && (
          <span className="text-sm" style={{ color: msg.tone === "error" ? "#B3261E" : msg.tone === "warn" ? "#8A5A00" : "rgba(22,48,43,0.6)" }}>
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}
