import sharp from "sharp";
import { getIntegrationSetting } from "@/lib/integrationSettings";

// Azure OpenAI image EDITS (inpainting) - the backend for Magic Erase,
// Generative Fill and Generative Expand in the Flier Builder's AI Studio.
//
// Same deployment setting as generation (azure_openai_image_deployment);
// the deployed model has to support /images/edits with a mask
// (gpt-image-1 does; DALL-E 3 on Azure does not - it will 404/400 and the
// error surfaces to the UI as-is so the admin knows what to deploy).
//
// Mask convention (OpenAI's): the mask is a PNG the same size as the
// image where TRANSPARENT pixels are the area to repaint. The Builder
// sends the mask the user brushed as an RGBA PNG with alpha=0 where they
// painted, so it's passed straight through.

async function fetchBytes(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) {
    const b64 = src.slice(src.indexOf(",") + 1);
    return Buffer.from(b64, "base64");
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not download the image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function imageConfig() {
  const endpoint =
    (await getIntegrationSetting("azure_openai_image_endpoint", process.env.AZURE_OPENAI_IMAGE_ENDPOINT)) ??
    (await getIntegrationSetting("azure_openai_endpoint", process.env.AZURE_OPENAI_ENDPOINT));
  const apiKey =
    (await getIntegrationSetting("azure_openai_image_api_key", process.env.AZURE_OPENAI_IMAGE_API_KEY)) ??
    (await getIntegrationSetting("azure_openai_api_key", process.env.AZURE_OPENAI_API_KEY));
  const deployment = await getIntegrationSetting("azure_openai_image_deployment", process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT);
  // Image edits need a newer API version than chat; allow an override.
  const apiVersion =
    (await getIntegrationSetting("azure_openai_image_api_version", process.env.AZURE_OPENAI_IMAGE_API_VERSION)) ?? "2025-04-01-preview";
  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "AI image editing isn't configured yet. Set 'azure_openai_image_deployment' (a gpt-image-1 deployment) in Admin > Connectors."
    );
  }
  return { endpoint: endpoint.replace(/\/+$/, ""), apiKey, deployment, apiVersion };
}

// Azure/OpenAI edits accept square or a few fixed sizes; we send the
// image at <=1024 on its long edge and scale the result back to the
// original dimensions so the element on the canvas doesn't change size.
const MAX_EDGE = 1024;

export type ImageEditMode = "fill" | "erase" | "expand";

export async function editImage(opts: {
  image: string; // data: URI or URL
  mask?: string | null; // data: URI (RGBA PNG; alpha 0 = repaint). Required for fill/erase.
  prompt: string;
  mode: ImageEditMode;
  // expand only: how many pixels of new content to add on each side, in
  // SOURCE image pixels.
  expand?: { top: number; right: number; bottom: number; left: number };
}): Promise<{ dataUri: string; width: number; height: number }> {
  const cfg = await imageConfig();
  const srcBuf = await fetchBytes(opts.image);
  const srcMeta = await sharp(srcBuf).metadata();
  const srcW = srcMeta.width ?? 1024;
  const srcH = srcMeta.height ?? 1024;

  let workImg: Buffer;
  let workMask: Buffer;
  let outW = srcW;
  let outH = srcH;

  if (opts.mode === "expand") {
    const e = opts.expand ?? { top: 0, right: 0, bottom: 0, left: 0 };
    outW = srcW + e.left + e.right;
    outH = srcH + e.top + e.bottom;
    // Image on a transparent canvas; mask transparent everywhere except
    // where the original sits (opaque = keep).
    workImg = await sharp({ create: { width: outW, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: srcBuf, left: e.left, top: e.top }])
      .png()
      .toBuffer();
    const keep = await sharp({ create: { width: srcW, height: srcH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    workMask = await sharp({ create: { width: outW, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: keep, left: e.left, top: e.top }])
      .png()
      .toBuffer();
  } else {
    if (!opts.mask) throw new Error("A mask is required for fill/erase.");
    workImg = await sharp(srcBuf).png().toBuffer();
    workMask = await sharp(await fetchBytes(opts.mask)).resize(srcW, srcH, { fit: "fill" }).png().toBuffer();
  }

  // Downscale for the API if needed (keep aspect), remember the factor.
  const scale = Math.min(1, MAX_EDGE / Math.max(outW, outH));
  const apiW = Math.max(16, Math.round(outW * scale));
  const apiH = Math.max(16, Math.round(outH * scale));
  if (scale < 1) {
    workImg = await sharp(workImg).resize(apiW, apiH, { fit: "fill" }).png().toBuffer();
    workMask = await sharp(workMask).resize(apiW, apiH, { fit: "fill", kernel: "nearest" }).png().toBuffer();
  }

  const prompt =
    opts.mode === "erase"
      ? `Remove the masked objects and seamlessly fill the area with the surrounding background, matching lighting, texture and perspective. ${opts.prompt}`.trim()
      : opts.mode === "expand"
        ? `Extend the image naturally beyond its original edges, continuing the scene, lighting and style so the result looks like one uncropped photo. ${opts.prompt}`.trim()
        : opts.prompt;

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(workImg)], { type: "image/png" }), "image.png");
  form.append("mask", new Blob([new Uint8Array(workMask)], { type: "image/png" }), "mask.png");
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", pickSize(apiW, apiH));

  const url = `${cfg.endpoint}/openai/deployments/${cfg.deployment}/images/edits?api-version=${cfg.apiVersion}`;
  const res = await fetch(url, { method: "POST", headers: { "api-key": cfg.apiKey }, body: form });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI image edit failed (${res.status}): ${t.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  const item = data.data?.[0];
  if (!item) throw new Error("AI image edit returned no result.");
  let resultBuf: Buffer;
  if (item.b64_json) resultBuf = Buffer.from(item.b64_json, "base64");
  else if (item.url) resultBuf = await fetchBytes(item.url);
  else throw new Error("AI image edit returned neither image data nor a URL.");

  // The API returns a fixed size; scale back to the working aspect and
  // then up to the original pixel dimensions.
  const final = await sharp(resultBuf).resize(outW, outH, { fit: "fill" }).png().toBuffer();
  return { dataUri: `data:image/png;base64,${final.toString("base64")}`, width: outW, height: outH };
}

function pickSize(w: number, h: number): string {
  const r = w / h;
  if (r > 1.2) return "1536x1024";
  if (r < 0.83) return "1024x1536";
  return "1024x1024";
}

// Upscale via Lanczos resampling + unsharp mask. Not a diffusion
// upscaler - it won't invent detail - but it turns a 1200px social photo
// into a clean 2400/4800px file that prints without visible pixel
// blocks, which is what the preflight warning is really about. Swapping
// in Real-ESRGAN (e.g. via Replicate) later is a one-function change.
export async function upscaleImage(src: string, factor: 2 | 4): Promise<{ dataUri: string; width: number; height: number }> {
  const buf = await fetchBytes(src);
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const cap = 6000;
  const f = Math.min(factor, cap / Math.max(w, h));
  const outW = Math.round(w * f);
  const outH = Math.round(h * f);
  const out = await sharp(buf)
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.2, m1: 0.6, m2: 0.3 })
    .png({ compressionLevel: 8 })
    .toBuffer();
  return { dataUri: `data:image/png;base64,${out.toString("base64")}`, width: outW, height: outH };
}
