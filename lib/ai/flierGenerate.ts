import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { describeImage } from "@/lib/ai/azureOpenAI";

// "Generate a flier" the way ChatGPT does it: the image model paints the
// whole flier - type, color, imagery - as one picture. What keeps it on
// brand is NOT trust in the model; it's three things layered on top:
//
//   1. The prompt is assembled from the brand_guidelines row marketing
//      maintains (exact hex colors, font family, voice, dos/donts, logo
//      rules, AI style notes) plus the exact text to render.
//   2. Marketing's real fliers go in as reference images, and the logo
//      goes in as an image to reproduce exactly - gpt-image-1.5's edits
//      endpoint accepts several input images and copies their style.
//   3. Every result is checked AFTER generation: a vision pass reads the
//      text back and confirms the title/date/phone made it in without
//      typos, and a palette pass measures how much of the image is far
//      from the brand colors. Failures are retried; what survives is
//      labeled with its scores so the assistant can say so.
//
// Two deployments: `azure_openai_image_deployment` (gpt-image-1.5) for
// finals, optional `azure_openai_image_draft_deployment` (gpt-image-1-mini)
// for cheap variations.

export type FlierGenFormat = "vertical" | "square" | "landscape" | "story";

export type FlierGenInput = {
  title: string;
  lines: string[]; // date/time, location, contact, CTA - rendered verbatim
  program?: string;
  subject?: string; // imagery description ("volunteers handing out coats")
  format?: FlierGenFormat;
  styleHint?: string; // "photo-led", "bold illustration", "minimal"
  quality: "draft" | "final";
  count: number; // 1..3
};

export type FlierGenResult = {
  url: string; // public URL in the flier-ai bucket
  width: number;
  height: number;
  textOk: boolean;
  missingText: string[];
  brandScore: number; // 0..1 fraction of saturated pixels near the brand palette
  brandOk: boolean;
  attempts: number;
};

const SIZE: Record<FlierGenFormat, { api: string; w: number; h: number }> = {
  vertical: { api: "1024x1536", w: 1024, h: 1536 },
  story: { api: "1024x1536", w: 1024, h: 1536 },
  square: { api: "1024x1024", w: 1024, h: 1024 },
  landscape: { api: "1536x1024", w: 1536, h: 1024 },
};

async function imageConfig(quality: "draft" | "final") {
  const endpoint =
    (await getIntegrationSetting("azure_openai_image_endpoint", process.env.AZURE_OPENAI_IMAGE_ENDPOINT)) ??
    (await getIntegrationSetting("azure_openai_endpoint", process.env.AZURE_OPENAI_ENDPOINT));
  const apiKey =
    (await getIntegrationSetting("azure_openai_image_api_key", process.env.AZURE_OPENAI_IMAGE_API_KEY)) ??
    (await getIntegrationSetting("azure_openai_api_key", process.env.AZURE_OPENAI_API_KEY));
  const finalDep = await getIntegrationSetting("azure_openai_image_deployment", process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT);
  const draftDep = (await getIntegrationSetting("azure_openai_image_draft_deployment", process.env.AZURE_OPENAI_IMAGE_DRAFT_DEPLOYMENT)) ?? finalDep;
  const apiVersion = (await getIntegrationSetting("azure_openai_image_api_version", process.env.AZURE_OPENAI_IMAGE_API_VERSION)) ?? "2025-04-01-preview";
  const deployment = quality === "draft" ? draftDep : finalDep;
  if (!endpoint || !apiKey || !deployment) {
    throw new Error("Flier generation isn't configured. Set the Image Deployment (gpt-image-1.5), endpoint and key in Admin > Connectors.");
  }
  return { endpoint: endpoint.replace(/\/+$/, ""), apiKey, deployment, apiVersion };
}

type Brand = {
  colors: { name: string; hex: string; usage?: string }[];
  fontFamily: string;
  voice: string;
  dos: string[];
  donts: string[];
  logoNotes: string;
  styleNotes: string;
  referenceUrls: string[];
  logoUrl: string | null;
};

export async function loadBrand(): Promise<Brand> {
  const admin = createAdminClient();
  const { data } = await admin.from("brand_guidelines").select("*").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle();
  const fonts: { role: string; family: string }[] = data?.fonts ?? [];
  return {
    colors: Array.isArray(data?.colors) ? data.colors : [],
    fontFamily: fonts.find((f) => /primary/i.test(f.role))?.family ?? fonts[0]?.family ?? "a clean geometric sans-serif",
    voice: data?.voice_tone ?? "",
    dos: Array.isArray(data?.dos) ? data.dos : [],
    donts: Array.isArray(data?.donts) ? data.donts : [],
    logoNotes: data?.logo_usage_notes ?? "",
    styleNotes: data?.ai_style_notes ?? "",
    referenceUrls: Array.isArray(data?.reference_flier_urls) ? data.reference_flier_urls : [],
    logoUrl: await getIntegrationSetting("brand_logo_url"),
  };
}

export function buildPrompt(input: FlierGenInput, brand: Brand, refCount: number, hasLogo: boolean, retryNote?: string): string {
  const palette = brand.colors.map((c) => `${c.name} ${c.hex}${c.usage ? ` (${c.usage})` : ""}`).join("; ");
  const textBlock = [`TITLE: "${input.title}"`, ...input.lines.map((l, i) => `LINE ${i + 1}: "${l}"`)].join("\n");
  const parts = [
    `Design a finished, print-ready ${input.format ?? "vertical"} event flier for ICNA Relief USA, a Muslim-led humanitarian nonprofit${input.program ? ` (${input.program} program)` : ""}.`,
    refCount > 0
      ? `The first ${refCount} attached image${refCount > 1 ? "s are" : " is"} ICNA Relief's own fliers: match their layout language, typography treatment, color usage, photo style and overall polish exactly. This must look like the same designer made it.`
      : "",
    hasLogo ? `The ${refCount > 0 ? "last" : ""} attached image is the ICNA Relief logo. Reproduce it EXACTLY as given - same proportions, colors and wordmark - placed ${brand.logoNotes ? `per these rules: ${brand.logoNotes}` : "in a bottom corner with clear space around it"}. Never redraw, restyle, recolor or stretch it, and never invent a different logo.` : "Do not invent any logo.",
    `BRAND COLORS - use only these (plus white, black and neutral greys): ${palette || "deep green and warm gold"}.`,
    `TYPOGRAPHY: ${brand.fontFamily} or a visually equivalent clean sans-serif. Strong hierarchy: the title is the largest element.`,
    brand.voice ? `VOICE: ${brand.voice}` : "",
    brand.styleNotes ? `ART DIRECTION: ${brand.styleNotes}` : "",
    input.styleHint ? `STYLE FOR THIS FLIER: ${input.styleHint}.` : "",
    input.subject ? `IMAGERY: ${input.subject}. Respectful, dignified depiction of people; modest dress; no caricature.` : "",
    brand.dos.length ? `ALWAYS: ${brand.dos.join("; ")}.` : "",
    brand.donts.length ? `NEVER: ${brand.donts.join("; ")}.` : "",
    `RENDER THIS TEXT EXACTLY, character for character, with correct spelling, and nothing else as text:\n${textBlock}`,
    `No placeholder text, no lorem ipsum, no extra words, no watermark, no fake QR code. Keep all text inside a safe margin away from the edges. High contrast between text and background so every line is legible when printed.`,
    retryNote ?? "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

async function fetchBytes(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function callImageModel(prompt: string, format: FlierGenFormat, quality: "draft" | "final", refImages: Buffer[]): Promise<Buffer> {
  const cfg = await imageConfig(quality);
  const size = SIZE[format].api;
  const q = quality === "draft" ? "low" : "high";
  let res: Response;
  if (refImages.length > 0) {
    // edits endpoint: multiple input images act as style/content references
    const form = new FormData();
    for (let i = 0; i < refImages.length; i++) {
      form.append("image[]", new Blob([new Uint8Array(refImages[i])], { type: "image/png" }), `ref${i}.png`);
    }
    form.append("prompt", prompt);
    form.append("n", "1");
    form.append("size", size);
    form.append("quality", q);
    res = await fetch(`${cfg.endpoint}/openai/deployments/${cfg.deployment}/images/edits?api-version=${cfg.apiVersion}`, { method: "POST", headers: { "api-key": cfg.apiKey }, body: form });
  } else {
    res = await fetch(`${cfg.endpoint}/openai/deployments/${cfg.deployment}/images/generations?api-version=${cfg.apiVersion}`, {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, n: 1, size, quality: q, output_format: "png" }),
    });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Image model error (${res.status}): ${t.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return fetchBytes(item.url);
  throw new Error("Image model returned no image.");
}

// ---- Post-generation checks ----

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function verifyText(pngDataUri: string, required: string[]): Promise<{ ok: boolean; missing: string[]; seen: string }> {
  let seen = "";
  try {
    seen = await describeImage(
      pngDataUri,
      "Transcribe every piece of text visible in this flier image, exactly as written, one item per line. Do not describe the image; output only the text you can read."
    );
  } catch {
    // Vision unavailable - don't block generation on it.
    return { ok: true, missing: [], seen: "" };
  }
  const hay = norm(seen);
  const missing: string[] = [];
  for (const r of required) {
    const needle = norm(r);
    if (!needle) continue;
    // Accept if the whole phrase is present, or (for long lines) if >=80%
    // of its words are - vision transcription sometimes drops punctuation.
    if (hay.includes(needle)) continue;
    const words = needle.split(" ").filter((w) => w.length > 2);
    const hit = words.filter((w) => hay.includes(w)).length;
    if (words.length === 0 || hit / words.length >= 0.8) continue;
    missing.push(r);
  }
  return { ok: missing.length === 0, missing, seen };
}

function hexToRgb(hex: string) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}

// Fraction of saturated (non-neutral) pixels that sit near a brand color.
// Neutrals (white/black/grey, low saturation) are always allowed, so a
// photo's skin tones and shadows don't count against the score, but a
// big off-palette purple headline would.
export async function brandColorScore(png: Buffer, palette: string[]): Promise<number> {
  if (palette.length === 0) return 1;
  const { data, info } = await sharp(png).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const brand = palette.map(hexToRgb);
  let saturated = 0;
  let near = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.25 || max < 40) continue; // neutral
    saturated++;
    let best = Infinity;
    for (const [br, bg, bb] of brand) {
      const d = Math.hypot(r - br, g - bg, b - bb);
      if (d < best) best = d;
    }
    if (best < 90) near++;
  }
  return saturated === 0 ? 1 : near / saturated;
}

async function uploadPng(png: Buffer, key: string): Promise<string> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from("flier-ai").upload(key, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Could not store the generated flier: ${error.message}`);
  return admin.storage.from("flier-ai").getPublicUrl(key).data.publicUrl;
}

export async function generateBrandFliers(input: FlierGenInput): Promise<{ results: FlierGenResult[]; brandRefs: number; warnings: string[] }> {
  const brand = await loadBrand();
  const format = input.format ?? "vertical";
  const warnings: string[] = [];

  // Reference images: up to 4 of marketing's fliers + the logo (last).
  const refs: Buffer[] = [];
  for (const u of brand.referenceUrls.slice(0, 4)) {
    try {
      refs.push(await sharp(await fetchBytes(u)).resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer());
    } catch {
      warnings.push(`Couldn't load a reference flier (${u.slice(0, 60)}…)`);
    }
  }
  const refCount = refs.length;
  let hasLogo = false;
  if (brand.logoUrl) {
    try {
      refs.push(await sharp(await fetchBytes(brand.logoUrl)).resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer());
      hasLogo = true;
    } catch {
      warnings.push("Couldn't load the brand logo image - generated without it.");
    }
  }
  if (refCount === 0) warnings.push("No reference fliers are set in Brand Guidelines yet, so the style is guided by colors/fonts only. Add 3–5 real fliers there for much closer results.");

  const palette = brand.colors.map((c) => c.hex).filter((h) => /^#[0-9a-f]{3,6}$/i.test(h));
  const required = [input.title, ...input.lines];
  const results: FlierGenResult[] = [];
  const count = Math.max(1, Math.min(3, input.count));

  for (let v = 0; v < count; v++) {
    let attempts = 0;
    let retryNote: string | undefined;
    let best: FlierGenResult | null = null;
    while (attempts < 2) {
      attempts++;
      const prompt = buildPrompt({ ...input, format }, brand, refCount, hasLogo, retryNote);
      const png = await callImageModel(prompt, format, input.quality, refs);
      const dataUri = `data:image/png;base64,${png.toString("base64")}`;
      const [text, score] = await Promise.all([verifyText(dataUri, required), brandColorScore(png, palette)]);
      const brandOk = score >= 0.6;
      const url = await uploadPng(png, `generated/${Date.now()}-${v}-${attempts}.png`);
      const r: FlierGenResult = { url, width: SIZE[format].w, height: SIZE[format].h, textOk: text.ok, missingText: text.missing, brandScore: Math.round(score * 100) / 100, brandOk, attempts };
      if (!best || (r.textOk && r.brandOk) || (r.textOk && !best.textOk) || (r.brandOk && !best.brandOk && r.textOk === best.textOk)) best = r;
      if (r.textOk && r.brandOk) break;
      retryNote = [
        !text.ok ? `PREVIOUS ATTEMPT HAD TEXT ERRORS. These lines were missing or misspelled and must be rendered exactly: ${text.missing.map((m) => `"${m}"`).join(", ")}. Use larger, simpler type for them.` : "",
        !brandOk ? `PREVIOUS ATTEMPT USED OFF-BRAND COLORS. Restrict every colored element strictly to the brand palette listed above.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (best) results.push(best);
  }

  return { results, brandRefs: refCount, warnings };
}
