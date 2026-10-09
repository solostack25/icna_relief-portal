"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  blank,
  isObject,
  overlaySection,
  same,
  sectionProblems,
  WEB_MEDIA_BUCKET,
  type Field,
  type Json,
  type JsonObject,
  type Problem,
  type WebsiteSchema,
} from "@/lib/websiteContent";

export type SavedSection = { value: unknown; updated_at: string };

type Msg = { tone: "ok" | "warn" | "error"; text: string };

const INK = "#16302B";
const DIM = "rgba(22,48,43,0.6)";
const LINE = "rgba(22,48,43,0.12)";
const GREEN = "var(--portal-emerald, #1F6F54)";
const RED = "#B3261E";

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(22,48,43,0.18)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  background: "#fff",
  width: "100%",
  color: INK,
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.75)", display: "block", marginBottom: 4 };
const helpStyle: React.CSSProperties = { fontSize: 12, color: DIM, margin: "4px 0 0" };
const smallBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid rgba(22,48,43,0.18)",
  background: "#fff",
  color: INK,
  cursor: "pointer",
};
const cardStyle: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 20px" };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;

/** Uploads a file to the public web-media bucket and returns its address. Only editors are allowed by the bucket's rules. */
async function upload(file: File, kind: "image" | "video"): Promise<{ url?: string; error?: string }> {
  const okType = kind === "image" ? IMAGE_TYPES.includes(file.type) : file.type === "video/mp4";
  if (!okType) return { error: kind === "image" ? "Use a JPG, PNG, WebP or AVIF photo." : "Use an MP4 video." };
  const limit = kind === "image" ? MAX_IMAGE_MB : MAX_VIDEO_MB;
  if (file.size > limit * 1024 * 1024) return { error: `That file is larger than ${limit} MB. Export a smaller version and try again.` };

  const ext = (file.name.match(/\.([A-Za-z0-9]{2,5})$/)?.[1] ?? (kind === "image" ? "jpg" : "mp4")).toLowerCase();
  const base = file.name.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || kind;
  const path = `site/${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}-${base}.${ext}`;

  const supabase = createClient();
  const { error } = await supabase.storage.from(WEB_MEDIA_BUCKET).upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { url: supabase.storage.from(WEB_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl };
}

function UploadButton({ kind, onDone }: { kind: "image" | "video"; onDone: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept={kind === "image" ? IMAGE_TYPES.join(",") : "video/mp4"}
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          const r = await upload(file, kind);
          setBusy(false);
          if (r.url) onDone(r.url);
          else setError(r.error ?? "Upload failed.");
        }}
      />
      <button type="button" style={{ ...smallBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : kind === "image" ? "Upload a photo" : "Upload a video"}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: 12, color: RED }}>
          {error}
        </span>
      )}
    </span>
  );
}

function Changed({ onRestore }: { onRestore: () => void }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ fontSize: 11, color: "#8A5A00", marginLeft: 8 }}>
      <span style={{ background: "#FFF1D6", borderRadius: 999, padding: "1px 8px", fontWeight: 600 }}>Changed</span>
      <button type="button" onClick={onRestore} style={{ background: "none", border: 0, padding: 0, color: "#8A5A00", textDecoration: "underline", cursor: "pointer", fontSize: 11 }}>
        Use the website’s own
      </button>
    </span>
  );
}

type FieldProps = {
  field: Field;
  value: Json;
  /** The website's built-in value. Undefined inside list rows, which have no built-in counterpart. */
  original: Json | undefined;
  onChange: (next: Json) => void;
  id: string;
  depth: number;
  siblings: number;
};

function FieldEditor({ field, value, original, onChange, id, depth, siblings }: FieldProps) {
  const changed = original !== undefined && !same(value, original);
  const restore = changed ? <Changed onRestore={() => onChange(original as Json)} /> : null;

  switch (field.kind) {
    case "text":
    case "textarea": {
      const v = typeof value === "string" ? value : "";
      const over = v.trim().length > field.max;
      return (
        <div>
          <label style={labelStyle} htmlFor={id}>
            {field.label}
            {restore}
          </label>
          {field.kind === "text" ? (
            <input id={id} style={inputStyle} value={v} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <textarea
              id={id}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              rows={Math.min(14, Math.max(3, Math.ceil(v.length / 90) + v.split("\n").length - 1))}
              value={v}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
          <p style={{ ...helpStyle, color: over ? RED : DIM }}>
            {field.help ? `${field.help} ` : ""}
            {v.trim().length > field.max * 0.8 || over ? `${v.trim().length} of ${field.max} characters.` : ""}
          </p>
        </div>
      );
    }
    case "number":
      return (
        <div style={{ maxWidth: 260 }}>
          <label style={labelStyle} htmlFor={id}>
            {field.label}
            {restore}
          </label>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            step={1}
            style={inputStyle}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
          {field.help && <p style={helpStyle}>{field.help}</p>}
        </div>
      );
    case "toggle":
      return (
        <div>
          <label className="inline-flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600, color: INK, cursor: "pointer" }}>
            <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
            {field.label}
          </label>
          {restore}
          {field.help && <p style={helpStyle}>{field.help}</p>}
        </div>
      );
    case "select":
      return (
        <div style={{ maxWidth: 360 }}>
          <label style={labelStyle} htmlFor={id}>
            {field.label}
            {restore}
          </label>
          <select id={id} style={inputStyle} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {field.help && <p style={helpStyle}>{field.help}</p>}
        </div>
      );
    case "url":
      return (
        <div>
          <label style={labelStyle} htmlFor={id}>
            {field.label}
            {restore}
          </label>
          <input
            id={id}
            style={inputStyle}
            inputMode="url"
            placeholder={field.target === "video" ? "https://…/video.mp4" : "https://… or /page-on-the-site"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.target === "video" && (
            <div className="mt-2">
              <UploadButton kind="video" onDone={(url) => onChange(url)} />
            </div>
          )}
          {field.help && <p style={helpStyle}>{field.help}</p>}
        </div>
      );
    case "image": {
      const o = isObject(value) ? value : {};
      const src = typeof o.src === "string" ? o.src : "";
      const alt = typeof o.alt === "string" ? o.alt : "";
      return (
        <div>
          <div style={labelStyle}>
            {field.label}
            {restore}
          </div>
          <div className="flex flex-wrap gap-3 items-start">
            <div
              style={{ width: 132, height: 88, borderRadius: 8, overflow: "hidden", background: "#E9EDE6", border: `1px solid ${LINE}`, flex: "none", display: "grid", placeItems: "center", fontSize: 11, color: DIM }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
              ) : (
                "No photo"
              )}
            </div>
            <div className="grid gap-2" style={{ flex: "1 1 280px", minWidth: 0 }}>
              <div>
                <label style={{ ...labelStyle, fontWeight: 500 }} htmlFor={`${id}-src`}>
                  Photo address
                </label>
                <input id={`${id}-src`} style={inputStyle} inputMode="url" value={src} onChange={(e) => onChange({ src: e.target.value, alt })} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontWeight: 500 }} htmlFor={`${id}-alt`}>
                  What the photo shows
                </label>
                <input id={`${id}-alt`} style={inputStyle} maxLength={240} value={alt} onChange={(e) => onChange({ src, alt: e.target.value })} />
              </div>
              <UploadButton kind="image" onDone={(url) => onChange({ src: url, alt })} />
            </div>
          </div>
          {field.help && <p style={helpStyle}>{field.help}</p>}
        </div>
      );
    }
    case "group": {
      const o = isObject(value) ? (value as JsonObject) : {};
      const d = isObject(original) ? (original as JsonObject) : undefined;
      const body = (
        <div className="grid gap-4">
          {field.fields.map((f) => (
            <FieldEditor
              key={f.key}
              field={f}
              value={o[f.key] ?? blank(f)}
              original={d ? d[f.key] : undefined}
              onChange={(next) => onChange({ ...o, [f.key]: next })}
              id={`${id}-${f.key}`}
              depth={depth + 1}
              siblings={field.fields.length}
            />
          ))}
        </div>
      );
      // Top-level groups, and small sets of nested ones, stay open; long sets (one per program) start closed.
      const startOpen = depth === 0 || siblings <= 4 || changed;
      return (
        <details open={startOpen} style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: depth === 0 ? "#fff" : "#FBFCFA" }}>
          <summary style={{ cursor: "pointer", padding: "12px 16px", fontWeight: 600, fontSize: depth === 0 ? 15 : 14, color: INK }}>
            {field.label}
            {changed && <span style={{ marginLeft: 8, fontSize: 11, background: "#FFF1D6", color: "#8A5A00", borderRadius: 999, padding: "1px 8px" }}>Changed</span>}
          </summary>
          <div style={{ padding: "4px 16px 16px" }}>
            {field.help && <p style={{ ...helpStyle, margin: "0 0 12px" }}>{field.help}</p>}
            {body}
          </div>
        </details>
      );
    }
    case "list": {
      const items = Array.isArray(value) ? (value as Json[]) : [];
      const set = (next: Json[]) => onChange(next);
      const move = (i: number, by: number) => {
        const j = i + by;
        if (j < 0 || j >= items.length) return;
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        set(next);
      };
      return (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", padding: "14px 16px" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>
              {field.label}
              {restore}
            </div>
            <span style={{ fontSize: 12, color: DIM }}>
              {items.length} of {field.max}
            </span>
          </div>
          {field.help && <p style={{ ...helpStyle, marginBottom: 4 }}>{field.help}</p>}
          <div className="grid gap-3 mt-3">
            {items.length === 0 && <p style={{ fontSize: 13, color: DIM, margin: 0 }}>Nothing here yet.</p>}
            {items.map((item, i) => {
              const o = isObject(item) ? (item as JsonObject) : {};
              return (
                <div key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FBFCFA", padding: "12px 14px" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                      {field.itemLabel} {i + 1}
                    </span>
                    <span className="inline-flex gap-1">
                      <button type="button" style={{ ...smallBtn, opacity: i === 0 ? 0.4 : 1 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${field.itemLabel} ${i + 1} up`}>
                        ↑
                      </button>
                      <button
                        type="button"
                        style={{ ...smallBtn, opacity: i === items.length - 1 ? 0.4 : 1 }}
                        disabled={i === items.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${field.itemLabel} ${i + 1} down`}
                      >
                        ↓
                      </button>
                      <button type="button" style={{ ...smallBtn, color: RED }} onClick={() => set(items.filter((_, k) => k !== i))}>
                        Remove
                      </button>
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {field.fields.map((f) => (
                      <FieldEditor
                        key={f.key}
                        field={f}
                        value={o[f.key] ?? blank(f)}
                        original={undefined}
                        onChange={(next) => set(items.map((it, k) => (k === i ? { ...o, [f.key]: next } : it)))}
                        id={`${id}-${i}-${f.key}`}
                        depth={depth + 1}
                        siblings={field.fields.length}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-3"
            style={{ ...smallBtn, opacity: items.length >= field.max ? 0.5 : 1 }}
            disabled={items.length >= field.max}
            onClick={() => set([...items, Object.fromEntries(field.fields.map((f) => [f.key, blank(f)]))])}
          >
            + Add {field.itemLabel.toLowerCase()}
          </button>
        </div>
      );
    }
  }
}

export default function WebsiteEditor({ schema, saved }: { schema: WebsiteSchema; saved: Record<string, SavedSection> }) {
  const { sections, urlRules } = schema;

  // The website's built-in content, in the same key order the editor uses, so "changed" comparisons are exact.
  const originals = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.key, overlaySection(s, schema.defaults[s.key], schema.defaults[s.key] ?? {})])) as Record<string, JsonObject>,
    [sections, schema.defaults],
  );
  const initial = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.key, overlaySection(s, saved[s.key]?.value, originals[s.key])])) as Record<string, JsonObject>,
    [sections, saved, originals],
  );

  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [savedAt, setSavedAt] = useState<Record<string, string | undefined>>(() => Object.fromEntries(sections.map((s) => [s.key, saved[s.key]?.updated_at])));
  const [active, setActive] = useState(sections[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [found, setFound] = useState<Problem[]>([]);

  const section = sections.find((s) => s.key === active);
  const dirty = (key: string) => !same(values[key], baseline[key]);
  const anyDirty = sections.some((s) => dirty(s.key));

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  if (!section) return <p className="text-sm">The website didn’t list anything that can be edited.</p>;

  const value = values[section.key];
  const original = originals[section.key];
  const hasSaved = savedAt[section.key] !== undefined;
  const matchesWebsite = same(value, original);

  function change(next: JsonObject) {
    setValues((v) => ({ ...v, [section!.key]: next }));
    setMsg(null);
    setFound([]);
  }

  async function save() {
    const issues = sectionProblems(section!, value, original, urlRules);
    setFound(issues);
    if (issues.length > 0) {
      setMsg({ tone: "error", text: `Fix ${issues.length === 1 ? "the problem" : `the ${issues.length} problems`} listed below, then save again.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/website-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: section!.key, value }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ tone: "error", text: j.error ?? "Couldn’t save. Try again." });
        return;
      }
      setBaseline((b) => ({ ...b, [section!.key]: value }));
      setSavedAt((s) => ({ ...s, [section!.key]: j.updated_at ?? new Date().toISOString() }));
      setMsg(j.refreshed ? { tone: "ok", text: "Saved and live on the website now." } : { tone: "warn", text: "Saved. The website will show the change within the hour." });
    } catch {
      setMsg({ tone: "error", text: "Couldn’t reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm(`Put “${section!.label}” back to the website’s own built-in content? Everything saved for this section will be removed from the website.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/website-content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: section!.key }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ tone: "error", text: j.error ?? "Couldn’t reset. Try again." });
        return;
      }
      setValues((v) => ({ ...v, [section!.key]: original }));
      setBaseline((b) => ({ ...b, [section!.key]: original }));
      setSavedAt((s) => ({ ...s, [section!.key]: undefined }));
      setFound([]);
      setMsg(j.refreshed ? { tone: "ok", text: "Reset. The website is showing its own content for this section again." } : { tone: "warn", text: "Reset. The website will catch up within the hour." });
    } catch {
      setMsg({ tone: "error", text: "Couldn’t reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const when = savedAt[section.key];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Sections of the website">
        {sections.map((s) => {
          const on = s.key === active;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setActive(s.key);
                setMsg(null);
                setFound([]);
              }}
              className="text-sm"
              style={{
                borderRadius: 999,
                padding: "7px 14px",
                fontWeight: 600,
                border: `1px solid ${on ? GREEN : "rgba(22,48,43,0.18)"}`,
                background: on ? GREEN : "#fff",
                color: on ? "#fff" : INK,
                cursor: "pointer",
              }}
            >
              {s.label}
              {dirty(s.key) ? " •" : ""}
            </button>
          );
        })}
      </div>

      <section style={cardStyle} aria-labelledby="ws-section-title">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="ws-section-title" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0 }}>
              {section.label}
            </h2>
            <p className="text-sm" style={{ color: DIM, margin: "4px 0 0" }}>
              {section.description}
            </p>
          </div>
          <span className="text-sm" style={{ color: DIM }}>
            {when ? `Last saved ${new Date(when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : "Using the website’s own content"}
          </span>
        </div>

        <div className="grid gap-4">
          {section.fields.map((f) => (
            <FieldEditor
              key={`${section.key}-${f.key}`}
              field={f}
              value={value[f.key] ?? blank(f)}
              original={original[f.key]}
              onChange={(next) => change({ ...value, [f.key]: next })}
              id={`ws-${section.key}-${f.key}`}
              depth={0}
              siblings={section.fields.length}
            />
          ))}
        </div>

        {/* Stays in view while scrolling a long section, so the save button and any problems are always visible. */}
        <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: `1px solid ${LINE}`, margin: "20px -20px -18px", padding: "14px 20px", borderRadius: "0 0 14px 14px" }}>
        {found.length > 0 && (
          <div role="alert" className="mb-3 text-sm" style={{ background: "#FDECEA", border: "1px solid #F5C2BD", borderRadius: 10, padding: "10px 14px", color: "#7A1B14", maxHeight: 180, overflowY: "auto" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>The website would not accept these:</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {found.slice(0, 12).map((p, i) => (
                <li key={i}>
                  <b>{p.path}</b> {p.message}
                </li>
              ))}
              {found.length > 12 && <li>and {found.length - 12} more.</li>}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty(section.key)}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg"
            style={{ background: "var(--icna-green, #2F6D46)", color: "#fff", opacity: busy || !dirty(section.key) ? 0.5 : 1, cursor: busy || !dirty(section.key) ? "default" : "pointer" }}
          >
            {busy ? "Saving…" : "Save and publish"}
          </button>
          {dirty(section.key) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setValues((v) => ({ ...v, [section.key]: baseline[section.key] }));
                setMsg(null);
                setFound([]);
              }}
              style={smallBtn}
            >
              Discard changes
            </button>
          )}
          {hasSaved && (
            <button type="button" disabled={busy} onClick={reset} style={{ ...smallBtn, color: RED }}>
              Reset section to the website’s own
            </button>
          )}
          <span className="text-sm" role="status" style={{ color: msg?.tone === "error" ? RED : msg?.tone === "warn" ? "#8A5A00" : DIM }}>
            {msg ? msg.text : dirty(section.key) ? "Unsaved changes." : !hasSaved && matchesWebsite ? "Nothing changed yet." : ""}
          </span>
        </div>
        </div>
      </section>
    </div>
  );
}
