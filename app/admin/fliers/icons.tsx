// Small, consistent line-icon set for the Flier Builder's toolbar and
// action bar - replaces the earlier emoji/unicode-symbol icons, which
// render inconsistently across platforms and looked dated next to the
// rest of the redesigned portal.

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Icon = {
  Undo: () => (
    <svg {...base}><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>
  ),
  Redo: () => (
    <svg {...base}><path d="M21 7v6h-6" /><path d="M21 13a9 9 0 1 1-3-7.7L21 8" /></svg>
  ),
  Duplicate: () => (
    <svg {...base}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V4a2 2 0 0 1 2-2h10" /></svg>
  ),
  Delete: () => (
    <svg {...base}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /></svg>
  ),
  AlignLeft: () => (
    <svg {...base}><path d="M4 3v18" /><rect x="7" y="6" width="12" height="4" /><rect x="7" y="14" width="7" height="4" /></svg>
  ),
  AlignCenterH: () => (
    <svg {...base}><path d="M12 3v18" /><rect x="6" y="6" width="12" height="4" /><rect x="8.5" y="14" width="7" height="4" /></svg>
  ),
  AlignRight: () => (
    <svg {...base}><path d="M20 3v18" /><rect x="5" y="6" width="12" height="4" /><rect x="10" y="14" width="7" height="4" /></svg>
  ),
  AlignTop: () => (
    <svg {...base}><path d="M3 4h18" /><rect x="6" y="7" width="4" height="12" /><rect x="14" y="7" width="4" height="7" /></svg>
  ),
  AlignCenterV: () => (
    <svg {...base}><path d="M3 12h18" /><rect x="6" y="6" width="4" height="12" /><rect x="14" y="8.5" width="4" height="7" /></svg>
  ),
  AlignBottom: () => (
    <svg {...base}><path d="M3 20h18" /><rect x="6" y="5" width="4" height="12" /><rect x="14" y="10" width="4" height="7" /></svg>
  ),
  BringFront: () => (
    <svg {...base}><rect x="7" y="7" width="12" height="12" rx="1" /><path d="M4 15V6a2 2 0 0 1 2-2h9" opacity="0.4" /></svg>
  ),
  BringForward: () => (
    <svg {...base}><rect x="9" y="4" width="11" height="11" rx="1" /><rect x="4" y="9" width="11" height="11" rx="1" opacity="0.4" /></svg>
  ),
  SendBackward: () => (
    <svg {...base}><rect x="4" y="9" width="11" height="11" rx="1" /><rect x="9" y="4" width="11" height="11" rx="1" opacity="0.4" /></svg>
  ),
  SendBack: () => (
    <svg {...base}><path d="M4 15V6a2 2 0 0 1 2-2h9" opacity="0.4" /><rect x="7" y="7" width="12" height="12" rx="1" /></svg>
  ),
  ZoomOut: () => (
    <svg {...base}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M8 11h6" /></svg>
  ),
  ZoomIn: () => (
    <svg {...base}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M11 8v6M8 11h6" /></svg>
  ),
  ZoomReset: () => (
    <svg {...base}><path d="M3 7V3h4" /><path d="M17 3h4v4" /><path d="M21 17v4h-4" /><path d="M7 21H3v-4" /></svg>
  ),
  TextTool: () => (
    <svg {...base}><path d="M5 5h14" /><path d="M12 5v14" /><path d="M9 19h6" /></svg>
  ),
  ImageTool: () => (
    <svg {...base}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
  ),
  RectTool: () => (
    <svg {...base}><rect x="3" y="6" width="18" height="12" rx="1" /></svg>
  ),
  CircleTool: () => (
    <svg {...base}><circle cx="12" cy="12" r="9" /></svg>
  ),
  LineTool: () => (
    <svg {...base}><path d="M4 20L20 4" /></svg>
  ),
  Bold: () => (
    <svg {...base}><path d="M6 4h8a4 4 0 0 1 0 8H6z" /><path d="M6 12h9a4 4 0 0 1 0 8H6z" /></svg>
  ),
  Italic: () => (
    <svg {...base}><path d="M19 4h-9" /><path d="M14 20H5" /><path d="M15 4L9 20" /></svg>
  ),
  Style: () => (
    <svg {...base}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>
  ),
  Effects: () => (
    <svg {...base}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ),
  Layers: () => (
    <svg {...base}><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
  ),
  ImagePicker: () => (
    <svg {...base}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
  ),
};
