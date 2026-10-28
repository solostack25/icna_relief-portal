"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type GalleryTemplate = {
  id: string;
  name: string;
  category: string | null;
  program: string | null;
  language: string | null;
  format_label: string | null;
  canvas_width: number;
  canvas_height: number;
  canvas_background: string | null;
  thumbnail_data_url: string | null;
  is_active: boolean;
  updated_at: string;
  extra_pages?: unknown[] | null;
  editable_element_ids?: unknown[] | null;
};

const SWATCHES = ["#2F6D46", "#E2892F", "#4A7FB5", "#B5566B", "#7A5FB0", "#3E9E8F"];
function swatchFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return SWATCHES[hash % SWATCHES.length];
}

function formatGroup(w: number, h: number): string {
  const r = w / h;
  if (Math.abs(r - 1) < 0.05) return "Square";
  if (r < 0.6) return "Story";
  if (r < 0.95) return "Portrait";
  if (r > 2.2) return "Banner";
  return "Landscape";
}

// Shared template gallery (Canva-style): thumbnail cards with filters by
// program, format and language plus a text search. Used by the
// field-office /fliers page and the marketing templates admin.
export default function FlierTemplateGallery({
  templates,
  hrefFor,
  admin = false,
  onToggleActive,
  leading,
  recentIds,
}: {
  templates: GalleryTemplate[];
  hrefFor: (t: GalleryTemplate) => string;
  admin?: boolean;
  onToggleActive?: (t: GalleryTemplate) => void;
  leading?: React.ReactNode;
  // Template ids this office used recently - shown in a row at the top.
  recentIds?: string[];
}) {
  const [q, setQ] = useState("");
  const [program, setProgram] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  const programs = useMemo(() => [...new Set(templates.map((t) => t.program).filter(Boolean) as string[])].sort(), [templates]);
  const formats = useMemo(() => [...new Set(templates.map((t) => formatGroup(t.canvas_width, t.canvas_height)))].sort(), [templates]);
  const languages = useMemo(() => [...new Set(templates.map((t) => t.language ?? "English"))].sort(), [templates]);

  const filtered = templates.filter((t) => {
    if (program && t.program !== program) return false;
    if (format && formatGroup(t.canvas_width, t.canvas_height) !== format) return false;
    if (language && (t.language ?? "English") !== language) return false;
    if (q.trim()) {
      const s = `${t.name} ${t.category ?? ""} ${t.program ?? ""}`.toLowerCase();
      if (!s.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });
  const recent = recentIds?.length ? recentIds.map((id) => filtered.find((t) => t.id === id)).filter(Boolean).slice(0, 4) as GalleryTemplate[] : [];
  const rest = recent.length ? filtered.filter((t) => !recent.some((r) => r.id === t.id)) : filtered;

  const Chip = ({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className="text-[11px] font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap" style={{ background: on ? "#16302B" : "#fff", color: on ? "#fff" : "#16302B", border: "1px solid var(--portal-line)" }}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      <aside className="lg:w-[210px] flex-shrink-0 space-y-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className="w-full rounded-xl px-3 py-2.5 text-sm bg-white" style={{ border: "1px solid var(--portal-line)" }} />
        {programs.length > 0 && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide mb-1.5" style={{ color: "#7A9186" }}>
              Program
            </p>
            <div className="flex flex-wrap lg:flex-col gap-1">
              <button onClick={() => setProgram(null)} className="text-left text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background: !program ? "#E8F4EE" : "transparent", color: !program ? "var(--portal-emerald)" : "#16302B" }}>
                All programs
              </button>
              {programs.map((p) => (
                <button key={p} onClick={() => setProgram(program === p ? null : p)} className="text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: program === p ? "#E8F4EE" : "transparent", color: program === p ? "var(--portal-emerald)" : "#16302B" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {formats.length > 1 && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide mb-1.5" style={{ color: "#7A9186" }}>
              Format
            </p>
            <div className="flex flex-wrap gap-1.5">
              {formats.map((f) => (
                <Chip key={f} label={f} on={format === f} onClick={() => setFormat(format === f ? null : f)} />
              ))}
            </div>
          </div>
        )}
        {languages.length > 1 && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide mb-1.5" style={{ color: "#7A9186" }}>
              Language
            </p>
            <div className="flex flex-wrap gap-1.5">
              {languages.map((l) => (
                <Chip key={l} label={l} on={language === l} onClick={() => setLanguage(language === l ? null : l)} />
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 min-w-0 space-y-6">
        {recent.length > 0 && (
          <section>
            <h2 className="text-sm font-extrabold mb-2.5">Recently used by your office</h2>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
              {recent.map((t) => (
                <Card key={t.id} t={t} href={hrefFor(t)} admin={admin} onToggleActive={onToggleActive} />
              ))}
            </div>
          </section>
        )}
        <section>
          {recent.length > 0 && <h2 className="text-sm font-extrabold mb-2.5">All templates</h2>}
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {leading}
            {rest.map((t) => (
              <Card key={t.id} t={t} href={hrefFor(t)} admin={admin} onToggleActive={onToggleActive} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-sm mt-2" style={{ color: "rgba(22,48,43,0.5)" }}>
              No templates match. {admin ? "Start with the blank tile." : "Try clearing a filter."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Card({ t, href, admin, onToggleActive }: { t: GalleryTemplate; href: string; admin: boolean; onToggleActive?: (t: GalleryTemplate) => void }) {
  const swatch = swatchFor(t.category ?? t.name);
  const aspect = `${t.canvas_width} / ${t.canvas_height}`;
  const pageCount = 1 + (Array.isArray(t.extra_pages) ? t.extra_pages.length : 0);
  const editable = Array.isArray(t.editable_element_ids) ? t.editable_element_ids.length : 0;
  return (
    <Link href={href} className="flex flex-col rounded-2xl overflow-hidden bg-white cursor-pointer hover:-translate-y-0.5 hover:shadow-lg transition-all duration-150" style={{ boxShadow: "0 3px 12px rgba(22,48,43,0.08)", border: "1px solid var(--portal-line)" }}>
      <div className="relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: aspect, maxHeight: 240, background: t.canvas_background?.startsWith("#") ? t.canvas_background : `${swatch}22` }}>
        {t.thumbnail_data_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.thumbnail_data_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="flex items-center justify-center rounded-full font-bold" style={{ width: 44, height: 44, background: swatch, color: "white", fontSize: 17 }}>
            {t.name.trim().charAt(0).toUpperCase() || "T"}
          </span>
        )}
        {admin && (
          <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: t.is_active ? "var(--portal-emerald)" : "rgba(22,48,43,0.55)", color: "white" }}>
            {t.is_active ? "Published" : "Draft"}
          </span>
        )}
        {pageCount > 1 && (
          <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(22,48,43,0.75)", color: "#fff" }}>
            {pageCount} pages
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <span className="text-[13px] font-bold leading-tight">{t.name}</span>
        <span className="text-[11px]" style={{ color: "rgba(22,48,43,0.5)" }}>
          {[t.program ?? t.category, `${t.canvas_width}×${t.canvas_height}`, editable ? `${editable} editable` : null].filter(Boolean).join(" · ")}
        </span>
        {admin && onToggleActive && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleActive(t);
            }}
            className="self-start text-[11px] font-semibold mt-0.5 cursor-pointer hover:underline"
            style={{ color: "var(--portal-emerald)" }}
          >
            {t.is_active ? "Unpublish" : "Publish"}
          </button>
        )}
      </div>
    </Link>
  );
}
