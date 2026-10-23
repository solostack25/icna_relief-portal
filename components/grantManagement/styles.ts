import type { CSSProperties } from "react";

// Plain (non-client) module so server components get real values; a
// "use client" module hands server components references, not objects.
export const ink = "#16302B";
export const dim = "rgba(22,48,43,0.55)";
export const faint = "rgba(22,48,43,0.4)";
export const emerald = "#1F6F54";
export const gold = "#C99A3D";
export const rose = "#B5566B";
export const sky = "#3E7C9A";

export const inputStyle: CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--portal-line)",
  borderRadius: 12,
  padding: "11px 14px",
  background: "#fff",
  outline: "none",
  fontSize: 14,
  color: ink,
};
export const selectStyle: CSSProperties = { ...inputStyle, appearance: "auto", paddingRight: 10 };

export const th: CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: faint,
  padding: "10px 12px",
  borderBottom: "1px solid var(--portal-line)",
  whiteSpace: "nowrap",
  background: "#FDFBF6",
  position: "sticky",
  top: 0,
};
export const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid rgba(22,48,43,0.06)", fontSize: 13, color: ink, verticalAlign: "top" };
export const tdNum: CSSProperties = { ...td, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap" };
export const thNum: CSSProperties = { ...th, textAlign: "right" };
