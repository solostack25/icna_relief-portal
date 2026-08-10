// Builds the donor-facing itemized receipt PDF (no dollar amounts) —
// same design as the admin dashboard's donor invoice
// (icnarelief-donation-intake-admin/lib/renderInvoicePdf.ts), duplicated
// here so the intake app can email it immediately after the donor signs,
// without a cross-app call. If you change the layout in one place,
// change it in the other too.

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { LOGO_PNG_BASE64 } from "./logo";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const BRAND = rgb(0.02, 0.35, 0.3);
const GRAY = rgb(0.45, 0.45, 0.45);
const LIGHT = rgb(0.85, 0.85, 0.85);
const LOGO_ASPECT = 125 / 600; // source logo is 600x125

export type DonorInvoiceLine = {
  name: string;
  condition: "new" | "used" | "na";
  qty: number;
  notes: string | null;
};

export type DonorInvoiceData = {
  invoiceNumber: string;
  office: string | null;
  dateReceived: string | null;
  donorLabel: string;
  lines: DonorInvoiceLine[];
  totalItems: number;
  signatureDataUrl: string | null;
  disclaimer: string | null;
};

const CONDITION_LABEL: Record<string, string> = { new: "New", used: "Used", na: "—" };

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function wrapText(font: PDFFont, str: string, maxWidth: number, size: number): string[] {
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Same as wrapText, but respects the original line breaks in the input
// instead of collapsing everything into one wrapped blob. Blank lines
// become paragraph gaps.
function wrapParagraphs(font: PDFFont, str: string, maxWidth: number, size: number): string[] {
  const rawLines = str.split(/\r?\n/);
  const out: string[] = [];
  rawLines.forEach((raw) => {
    if (raw.trim() === "") {
      out.push("");
    } else {
      out.push(...wrapText(font, raw, maxWidth, size));
    }
  });
  return out;
}

export async function renderDonorInvoicePdf(data: DonorInvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function text(str: string, x: number, size: number, f: PDFFont, color = rgb(0, 0, 0)) {
    page.drawText(str, { x, y, size, font: f, color });
  }

  const logoW = 130;
  const logoH = logoW * LOGO_ASPECT;
  page.drawImage(logo, { x: MARGIN, y: y - logoH + 8, width: logoW, height: logoH });
  y -= logoH + 4;
  text("Donation Receipt (Itemized)", MARGIN, 14, bold);
  y -= 22;

  const rightX = PAGE_W - MARGIN - 200;
  const startY = y;
  text(`Invoice #: ${data.invoiceNumber}`, MARGIN, 10, bold);
  y -= 14;
  text(`Date received: ${fmtDate(data.dateReceived)}`, MARGIN, 10, font, GRAY);
  y -= 14;
  text(`Office: ${data.office ?? "—"}`, MARGIN, 10, font, GRAY);

  y = startY;
  page.drawText(`Donor: ${data.donorLabel}`, { x: rightX, y, size: 10, font: bold });
  y -= 28;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LIGHT });
  y -= 20;

  text("ITEM", MARGIN, 9, bold, GRAY);
  text("CONDITION", 380, 9, bold, GRAY);
  text("QTY", 480, 9, bold, GRAY);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LIGHT });
  y -= 16;

  data.lines.forEach((line) => {
    if (y - 30 < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    text(line.name, MARGIN, 10, font);
    text(CONDITION_LABEL[line.condition] ?? line.condition, 380, 10, font, GRAY);
    text(String(line.qty), 480, 10, font);
    y -= 14;
    if (line.notes) {
      text(line.notes, MARGIN, 8, font, GRAY);
      y -= 12;
    } else {
      y -= 4;
    }
  });

  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LIGHT });
  y -= 20;
  text(`Total items: ${data.totalItems}`, MARGIN, 11, bold);
  y -= 30;

  if (data.signatureDataUrl) {
    try {
      const base64 = data.signatureDataUrl.split(",")[1] ?? data.signatureDataUrl;
      const sigImg = await doc.embedPng(Buffer.from(base64, "base64"));
      const sigW = 180;
      const sigH = (sigImg.height / sigImg.width) * sigW;
      if (y - sigH - 30 < MARGIN) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
      }
      page.drawImage(sigImg, { x: MARGIN, y: y - sigH, width: sigW, height: sigH });
      y -= sigH + 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + sigW, y }, thickness: 0.75, color: LIGHT });
      y -= 12;
      text("Donor Signature", MARGIN, 8, font, GRAY);
      y -= 24;
    } catch {
      // Corrupt/missing signature data — skip it rather than fail the whole PDF.
    }
  }

  const disclaimer =
    data.disclaimer ??
    "No monetary value is stated on this receipt. See your records for the fair market value of donated items.";
  const wrapWidth = PAGE_W - 2 * MARGIN;
  wrapParagraphs(font, disclaimer, wrapWidth, 8).forEach((line) => {
    if (y - 12 < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    if (line === "") {
      y -= 6; // paragraph gap
    } else {
      text(line, MARGIN, 8, font, GRAY);
      y -= 11;
    }
  });

  return doc.save();
}
