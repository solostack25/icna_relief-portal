// Browser-safe constants for the public website listing (no secrets here).
export const PUBLIC_WEBSITE_URL = (process.env.NEXT_PUBLIC_PUBLIC_WEBSITE_URL ?? "https://icnarelief-web.vercel.app").replace(/\/$/, "");

export const WEBSITE_SERVICES = [
  { id: "food", label: "Food pantry / food assistance" },
  { id: "health", label: "Health care" },
  { id: "counseling", label: "Counseling" },
  { id: "refugee", label: "Refugee & newcomer services" },
  { id: "classes", label: "Classes (ESL, computer, sewing…)" },
  { id: "financial", label: "Financial assistance" },
  { id: "youth", label: "Youth programs" },
] as const;

export const WEBSITE_KINDS = [
  { id: "office", label: "Local office" },
  { id: "pantry", label: "Food pantry" },
  { id: "resource_center", label: "Resource center" },
  { id: "clinic", label: "Free clinic" },
] as const;
