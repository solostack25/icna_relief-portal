// Website content editor (Admin > Website): shared types and helpers. Browser-safe, no secrets.
//
// The public website describes what is editable (sections, fields and its own built-in value for each) at
// /api/content/schema. This portal builds its forms from that description, so a new editable field is a
// change to the website only. What gets saved here is stored in web_content, one row per section; the
// website checks every value again before showing it.

import { PUBLIC_WEBSITE_URL } from "./publicWebsiteShared";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export type Option = { value: string; label: string };
type Base = { key: string; label: string; help?: string };

export type Field =
  | (Base & { kind: "text" | "textarea"; max: number; optional?: boolean })
  | (Base & { kind: "number"; min: number; max: number })
  | (Base & { kind: "toggle" })
  | (Base & { kind: "select"; options: Option[] })
  | (Base & { kind: "url"; target: "page" | "video"; optional?: boolean })
  | (Base & { kind: "image" })
  | (Base & { kind: "group"; fields: Field[] })
  | (Base & { kind: "list"; itemLabel: string; min: number; max: number; fields: Field[] });

export type Section = { key: string; label: string; description: string; fields: Field[] };
export type UrlRule = { host: string; path: string };
export type WebsiteSchema = {
  version: number;
  sections: Section[];
  defaults: Record<string, JsonObject>;
  urlRules: { image: UrlRule[]; video: UrlRule[] };
};

export const WEBSITE_SCHEMA_URL = `${PUBLIC_WEBSITE_URL}/api/content/schema`;
export const WEB_MEDIA_BUCKET = "web-media";
export const SECTION_KEY = /^[a-z][a-z0-9_]{0,39}$/;
/** Largest section we accept, well under the database limit. */
export const MAX_SECTION_BYTES = 300_000;

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Asks the website what can be edited. Null when it can't be reached or doesn't support editing yet. */
export async function fetchWebsiteSchema(): Promise<WebsiteSchema | null> {
  try {
    const res = await fetch(WEBSITE_SCHEMA_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<WebsiteSchema>;
    if (j.version !== 1 || !Array.isArray(j.sections) || !isObject(j.defaults)) return null;
    return {
      version: 1,
      sections: j.sections,
      defaults: j.defaults as Record<string, JsonObject>,
      urlRules: { image: j.urlRules?.image ?? [], video: j.urlRules?.video ?? [] },
    };
  } catch {
    return null;
  }
}

/** An empty value of the right shape, for a new list row. */
export function blank(field: Field): Json {
  switch (field.kind) {
    case "text":
    case "textarea":
    case "url":
      return "";
    case "number":
      return "";
    case "toggle":
      return false;
    case "select":
      return "";
    case "image":
      return { src: "", alt: "" };
    case "group":
      return Object.fromEntries(field.fields.map((f) => [f.key, blank(f)]));
    case "list":
      return [];
  }
}

/** The value the editor starts from: what was saved where it has the right shape, the website's own value elsewhere. */
export function overlay(field: Field, saved: unknown, fallback: Json): Json {
  switch (field.kind) {
    case "text":
    case "textarea":
    case "url":
    case "select":
      return typeof saved === "string" ? saved : fallback;
    case "number":
      return typeof saved === "number" && Number.isFinite(saved) ? saved : fallback;
    case "toggle":
      return typeof saved === "boolean" ? saved : fallback;
    case "image":
      return isObject(saved) && typeof saved.src === "string" && typeof saved.alt === "string" ? { src: saved.src, alt: saved.alt } : fallback;
    case "group": {
      const fb = isObject(fallback) ? (fallback as JsonObject) : {};
      const s = isObject(saved) ? saved : {};
      return Object.fromEntries(field.fields.map((f) => [f.key, overlay(f, s[f.key], fb[f.key] ?? blank(f))]));
    }
    case "list":
      return Array.isArray(saved)
        ? saved.filter(isObject).map((item) => Object.fromEntries(field.fields.map((f) => [f.key, overlay(f, item[f.key], blank(f))])))
        : fallback;
  }
}

export function overlaySection(section: Section, saved: unknown, defaults: JsonObject): JsonObject {
  const s = isObject(saved) ? saved : {};
  return Object.fromEntries(section.fields.map((f) => [f.key, overlay(f, s[f.key], defaults[f.key] ?? blank(f))]));
}

function urlAllowed(value: string, rules: UrlRule[]) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    return rules.some((r) => new RegExp(r.host).test(u.hostname) && new RegExp(r.path).test(u.pathname));
  } catch {
    return false;
  }
}

export type Problem = { path: string; message: string };

/**
 * What the website would refuse, in plain words, so it can be fixed before saving.
 * The website applies the same rules on its side; this only saves a round trip.
 * A value left exactly as the website has it is never a problem.
 */
export function problems(field: Field, value: Json, original: Json | undefined, rules: WebsiteSchema["urlRules"], where: string): Problem[] {
  const at = where ? `${where} › ${field.label}` : field.label;
  if (field.kind !== "group" && field.kind !== "list" && original !== undefined && same(value, original)) return [];
  switch (field.kind) {
    case "text":
    case "textarea": {
      const v = typeof value === "string" ? value.trim() : "";
      if (!v && !field.optional) return [{ path: at, message: "can’t be empty." }];
      if (v.length > field.max) return [{ path: at, message: `is ${v.length - field.max} characters too long (limit ${field.max}).` }];
      return [];
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return [{ path: at, message: "needs a number." }];
      if (!Number.isInteger(value)) return [{ path: at, message: "needs a whole number." }];
      if (value < field.min || value > field.max) return [{ path: at, message: `must be between ${field.min.toLocaleString("en-US")} and ${field.max.toLocaleString("en-US")}.` }];
      return [];
    }
    case "toggle":
      return [];
    case "select":
      return field.options.some((o) => o.value === value) ? [] : [{ path: at, message: "needs a choice." }];
    case "url": {
      const v = typeof value === "string" ? value.trim() : "";
      if (!v) return field.optional ? [] : [{ path: at, message: "can’t be empty." }];
      if (field.target === "video") {
        return urlAllowed(v, rules.video) ? [] : [{ path: at, message: "must be a video uploaded here or a file on videos.pexels.com." }];
      }
      if (v.startsWith("/") && !v.startsWith("//")) return [];
      return /^https:\/\/\S+$/.test(v) ? [] : [{ path: at, message: "must start with https:// or be a page on the site like /zakat." }];
    }
    case "image": {
      const o = isObject(value) ? value : {};
      const src = typeof o.src === "string" ? o.src.trim() : "";
      const alt = typeof o.alt === "string" ? o.alt.trim() : "";
      const out: Problem[] = [];
      if (!src || !urlAllowed(src, rules.image)) out.push({ path: at, message: "needs a photo uploaded here, or one from images.pexels.com or icnarelief.org." });
      if (!alt) out.push({ path: at, message: "needs a short description of the photo, for people who can’t see it." });
      return out;
    }
    case "group": {
      const o = isObject(value) ? (value as JsonObject) : {};
      const d = isObject(original) ? (original as JsonObject) : undefined;
      return field.fields.flatMap((f) => problems(f, o[f.key] ?? blank(f), d?.[f.key], rules, at));
    }
    case "list": {
      const items = Array.isArray(value) ? value : [];
      const out: Problem[] = [];
      if (items.length < field.min) out.push({ path: at, message: `needs at least ${field.min}.` });
      if (items.length > field.max) out.push({ path: at, message: `can have at most ${field.max}.` });
      items.forEach((item, i) => {
        const o = isObject(item) ? (item as JsonObject) : {};
        for (const f of field.fields) out.push(...problems(f, o[f.key] ?? blank(f), undefined, rules, `${at} › ${field.itemLabel} ${i + 1}`));
      });
      return out;
    }
  }
}

export const sectionProblems = (section: Section, value: JsonObject, original: JsonObject, rules: WebsiteSchema["urlRules"]) =>
  section.fields.flatMap((f) => problems(f, value[f.key] ?? blank(f), original[f.key], rules, ""));

export function same(a: Json, b: Json) {
  return JSON.stringify(a) === JSON.stringify(b);
}
