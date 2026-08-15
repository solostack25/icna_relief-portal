// Curated "sticker" icons for the Flier Builder - a fixed set of simple,
// verified path shapes rather than a large imported icon library, since
// a broken/malformed path here fails silently as an invisible or
// distorted shape on someone's actual flier. Each path is in a 24x24
// viewBox. `filled` icons render with a solid fill; `stroke` icons
// render as an outline only (fill="transparent") - matches which
// construction is actually correct for that shape rather than forcing
// everything into one rendering mode.

export type IconDef = { id: string; label: string; path: string; mode: "filled" | "stroke" };

export const ICON_LIBRARY: IconDef[] = [
  { id: "check", label: "Check", path: "M5 13 L9 17 L19 7", mode: "stroke" },
  { id: "x", label: "X", path: "M6 6 L18 18 M18 6 L6 18", mode: "stroke" },
  { id: "arrow-right", label: "Arrow Right", path: "M5 12 L19 12 M12 5 L19 12 L12 19", mode: "stroke" },
  { id: "arrow-left", label: "Arrow Left", path: "M19 12 L5 12 M12 5 L5 12 L12 19", mode: "stroke" },
  { id: "plus", label: "Plus", path: "M12 5 L12 19 M5 12 L19 12", mode: "stroke" },
  { id: "envelope", label: "Envelope", path: "M2 4 L22 4 L22 20 L2 20 Z M2 4 L12 13 L22 4", mode: "stroke" },
  {
    id: "heart",
    label: "Heart",
    path:
      "M12 21.35 L10.55 20.03 C5.4 15.36 2 12.28 2 8.5 C2 5.42 4.42 3 7.5 3 C9.24 3 10.91 3.81 12 5.09 C13.09 3.81 14.76 3 16.5 3 C19.58 3 22 5.42 22 8.5 C22 12.28 18.6 15.36 13.45 20.04 Z",
    mode: "filled",
  },
  {
    id: "bolt",
    label: "Bolt",
    path: "M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z",
    mode: "filled",
  },
  { id: "flag", label: "Flag", path: "M4 2 L4 10 L18 6 Z", mode: "filled" },
  {
    id: "calendar",
    label: "Calendar",
    path: "M3 4 L21 4 L21 20 L3 20 Z M3 8 L21 8 M7 2 L7 6 M17 2 L17 6",
    mode: "stroke",
  },
  {
    id: "pin",
    label: "Location Pin",
    path: "M12 2 C8.13 2 5 5.13 5 9 C5 14.25 12 22 12 22 C12 22 19 14.25 19 9 C19 5.13 15.87 2 12 2 Z",
    mode: "filled",
  },
  {
    id: "phone",
    label: "Phone",
    path:
      "M7 2 L17 2 C17.55 2 18 2.45 18 3 L18 21 C18 21.55 17.55 22 17 22 L7 22 C6.45 22 6 21.55 6 21 L6 3 C6 2.45 6.45 2 7 2 Z M12 17.8 C12.66 17.8 13.2 18.34 13.2 19 C13.2 19.66 12.66 20.2 12 20.2 C11.34 20.2 10.8 19.66 10.8 19 C10.8 18.34 11.34 17.8 12 17.8 Z",
    mode: "stroke",
  },
  {
    id: "globe",
    label: "Globe",
    path:
      "M12 2 C17.52 2 22 6.48 22 12 C22 17.52 17.52 22 12 22 C6.48 22 2 17.52 2 12 C2 6.48 6.48 2 12 2 Z M2 12 L22 12 M12 2 C8 6 8 18 12 22 M12 2 C16 6 16 18 12 22",
    mode: "stroke",
  },
  {
    id: "sparkle",
    label: "Sparkle",
    path: "M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z",
    mode: "filled",
  },
];
