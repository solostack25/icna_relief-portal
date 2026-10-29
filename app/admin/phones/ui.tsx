// Shared, hook-free UI bits for the Phones admin pages (server + client safe).
import { card, dim, emerald, ink, line } from "../devices/style";

export { card, dim, emerald, ink, line };

export const rose = "#9A3412";
export const roseBg = "#FCE7DD";
export const goldFg = "#7A5A12";
export const goldBg = "#FBF0DC";
export const greenBg = "#EAF3EF";
export const muted = "rgba(22,48,43,0.68)";

export function fmtPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  const t = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (t.length === 10) return `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}`;
  return raw;
}

export function fmtDuration(sec: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function Pill({ children, fg, bg }: { children: React.ReactNode; fg: string; bg: string }) {
  return (
    <span className="inline-flex items-center text-[12px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap" style={{ color: fg, background: bg }}>
      {children}
    </span>
  );
}

export function Stat({ n, label, color = ink, dark = false }: { n: React.ReactNode; label: string; color?: string; dark?: boolean }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={dark ? { background: emerald, color: "#FBF7EF" } : card}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, lineHeight: 1.15, color: dark ? "#FBF7EF" : color }}>{n}</div>
      <div className="text-[13px]" style={{ color: dark ? "rgba(251,247,239,0.78)" : muted }}>
        {label}
      </div>
    </div>
  );
}

export function ErrorNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div role="alert" className="rounded-xl px-3.5 py-2.5 text-sm mb-3" style={{ background: roseBg, color: rose }}>
      {text}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 className="text-base font-bold m-0" style={{ color: ink }}>
        {children}
      </h2>
      {right}
    </div>
  );
}

export const btn: React.CSSProperties = {
  minHeight: 38,
  borderRadius: 999,
  border: `1px solid rgba(22,48,43,0.15)`,
  background: "#fff",
  color: ink,
  fontSize: 13,
  fontWeight: 600,
  padding: "0 14px",
  cursor: "pointer",
};

export const btnPrimary: React.CSSProperties = { ...btn, border: 0, background: emerald, color: "#fff", fontWeight: 700 };

export const btnDanger: React.CSSProperties = { ...btn, border: "1px solid #F1C9B8", color: rose };

export const input: React.CSSProperties = {
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid rgba(22,48,43,0.18)",
  padding: "0 10px",
  fontSize: 14,
  background: "#fff",
  color: ink,
  width: "100%",
  boxSizing: "border-box",
};
