"use client";

// Client-side export for the Flier Builder: hi-res PNG/JPG per page and a
// print PDF (trim size + bleed + crop marks). Runs entirely in the browser
// against the live Konva stages - no server render, nothing to time out
// on Vercel, and the exact same renderer that drew the preview draws the
// export, so what you see is what you get.
//
// The caller hands over a function that returns the Konva Stage for a
// given page index (BuilderClient keeps one hidden stage per page mounted
// while the Export sheet is open). We wait for fonts + images before
// capturing so nothing comes out as a fallback font or an empty frame.

import type Konva from "konva";
import type { FlierPage } from "./flierElements";
import { BLEED_IN, PRINT_DPI } from "./flierElements";

export type ExportFormat = "png" | "jpg" | "pdf";

export type ExportOptions = {
  format: ExportFormat;
  // Multiplier over canvas pixels for PNG/JPG (1 = canvas size, 3 ≈ 300 DPI
  // for a 1080px-wide flier printed at ~3.6in... in practice 2-3 is "print").
  pixelRatio: number;
  jpgQuality?: number; // 0..1
  // PDF only
  paper?: { widthIn: number; heightIn: number } | null; // null = match canvas aspect at 300 DPI
  bleed?: boolean;
  cropMarks?: boolean;
  fileBase: string;
};

export async function waitForAssets(pages: FlierPage[]): Promise<void> {
  const urls = new Set<string>();
  const fonts = new Set<string>();
  for (const p of pages) {
    for (const el of p.elements) {
      if (el.type === "image" && el.imageUrl) urls.add(el.imageUrl);
      if (el.type === "text") fonts.add(el.fontFamily);
    }
  }
  const fontJobs = [...fonts].map((f) => (document.fonts?.load(`16px "${f}"`) ?? Promise.resolve()).catch(() => null));
  const imgJobs = [...urls].map(
    (u) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = u;
      })
  );
  await Promise.all([...fontJobs, ...imgJobs]);
  // Two frames so Konva's batchDraw after font/image arrival has run.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export function stageToDataUrl(stage: Konva.Stage, pixelRatio: number, mime: "image/png" | "image/jpeg", quality = 0.92): string {
  // The stage is scaled for the editor; export at the canvas's own
  // coordinate space times pixelRatio regardless of current zoom.
  const scale = stage.scaleX() || 1;
  return stage.toDataURL({ pixelRatio: pixelRatio / scale, mimeType: mime, quality });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function slug(name: string) {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "flier";
}

export async function exportPagesAsImages(
  pages: FlierPage[],
  getStage: (pageIndex: number) => Konva.Stage | null,
  opts: ExportOptions
): Promise<{ filename: string; dataUrl: string }[]> {
  const out: { filename: string; dataUrl: string }[] = [];
  const mime = opts.format === "jpg" ? "image/jpeg" : "image/png";
  const ext = opts.format === "jpg" ? "jpg" : "png";
  for (let i = 0; i < pages.length; i++) {
    const stage = getStage(i);
    if (!stage) continue;
    const dataUrl = stageToDataUrl(stage, opts.pixelRatio, mime, opts.jpgQuality ?? 0.92);
    out.push({ filename: pages.length > 1 ? `${opts.fileBase}-p${i + 1}.${ext}` : `${opts.fileBase}.${ext}`, dataUrl });
  }
  return out;
}

// Print PDF. Every page is drawn as a hi-res raster "cover"-fitted onto
// the trim box plus bleed, then crop marks are vector-drawn in the margin.
// Cover-fit means a 1080×1350 (4:5) flier on US Letter (8.5:11 ≈ 0.77)
// is scaled to fill and center-cropped slightly on the long axis - the
// same thing a print shop would do, and the preflight pass already warns
// when text sits in the trim/safe margin.
export async function exportPagesAsPdf(
  pages: FlierPage[],
  canvasWidth: number,
  canvasHeight: number,
  getStage: (pageIndex: number) => Konva.Stage | null,
  opts: ExportOptions
): Promise<{ filename: string; blob: Blob }> {
  const { jsPDF } = await import("jspdf");

  const aspect = canvasWidth / canvasHeight;
  const trimW = opts.paper ? opts.paper.widthIn : canvasWidth / PRINT_DPI;
  const trimH = opts.paper ? opts.paper.heightIn : canvasHeight / PRINT_DPI;
  const bleed = opts.bleed ? BLEED_IN : 0;
  const markSpace = opts.cropMarks ? 0.25 : 0; // room outside the bleed for marks
  const pageW = trimW + 2 * bleed + 2 * markSpace;
  const pageH = trimH + 2 * bleed + 2 * markSpace;

  const pdf = new jsPDF({ unit: "in", format: [pageW, pageH], orientation: pageW > pageH ? "landscape" : "portrait", compress: true });

  // Pixel ratio so the raster is ~300 DPI at the printed size.
  const targetPxW = (trimW + 2 * bleed) * PRINT_DPI;
  const pixelRatio = Math.min(6, Math.max(1, targetPxW / canvasWidth));

  for (let i = 0; i < pages.length; i++) {
    const stage = getStage(i);
    if (!stage) continue;
    if (i > 0) pdf.addPage([pageW, pageH], pageW > pageH ? "landscape" : "portrait");

    const dataUrl = stageToDataUrl(stage, pixelRatio, "image/jpeg", 0.95);

    // Cover-fit the canvas onto (trim + bleed).
    const boxW = trimW + 2 * bleed;
    const boxH = trimH + 2 * bleed;
    const boxX = markSpace;
    const boxY = markSpace;
    let drawW = boxW;
    let drawH = boxW / aspect;
    if (drawH < boxH) {
      drawH = boxH;
      drawW = boxH * aspect;
    }
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    // Clip to the bleed box so the cover-fit overflow doesn't spill into
    // the crop-mark margin.
    pdf.saveGraphicsState();
    // @ts-ignore - jsPDF typings lag the API; clip() exists at runtime
    pdf.rect(boxX, boxY, boxW, boxH, null);
    // @ts-ignore
    pdf.clip();
    // @ts-ignore
    pdf.discardPath?.();
    pdf.addImage(dataUrl, "JPEG", drawX, drawY, drawW, drawH, undefined, "FAST");
    pdf.restoreGraphicsState();

    if (opts.cropMarks) {
      const tx = markSpace + bleed; // trim box origin
      const ty = markSpace + bleed;
      const len = 0.18;
      const gap = 0.06;
      pdf.setLineWidth(0.004);
      pdf.setDrawColor(0, 0, 0);
      const corners: [number, number, number, number][] = [
        [tx, ty, -1, -1],
        [tx + trimW, ty, 1, -1],
        [tx, ty + trimH, -1, 1],
        [tx + trimW, ty + trimH, 1, 1],
      ];
      for (const [cx, cy, sx, sy] of corners) {
        // horizontal mark
        pdf.line(cx + sx * (bleed + gap), cy, cx + sx * (bleed + gap + len), cy);
        // vertical mark
        pdf.line(cx, cy + sy * (bleed + gap), cx, cy + sy * (bleed + gap + len));
      }
      pdf.setFontSize(6);
      pdf.setTextColor(120);
      pdf.text(`${opts.fileBase} · trim ${trimW}×${trimH} in · bleed ${bleed} in · ${PRINT_DPI} DPI`, markSpace, pageH - markSpace / 2);
    }
  }

  return { filename: `${opts.fileBase}.pdf`, blob: pdf.output("blob") };
}
