// Generates the printable barcode sheet PDF server-side, from the live
// items catalog — the in-app replacement for the old workflow of
// exporting items.json and running barcode_gen/generate_sheet.py by
// hand. Mirrors that script's layout (grouped by program, section
// headers, a Controls section for ACTION-UNDO/FINISH) but in
// TypeScript using bwip-js (barcode images) + pdf-lib (page layout).

import bwipjs from "bwip-js/node";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from "pdf-lib";

export type BarcodeSheetItem = {
  code: string;
  name: string;
  program: string;
  newPrice: number | null;
  usedPrice: number | null;
  manualPrice: boolean;
};

type Entry = {
  barcodeText: string;
  label: string;
  subLabel: string;
  kind: "item" | "action";
  program: string | null;
};

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 32;
const COLS = 4;
const GUTTER = 13;
const CELL_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GUTTER) / COLS;
const CELL_H = 83;
const HEADER_H = 46;
const SECTION_H = 22;

const DARK = rgb(0.08, 0.08, 0.08);
const RED = rgb(0.55, 0.15, 0.15);
const BRAND = rgb(0.05, 0.4, 0.35);

async function barcodePng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 3,
    height: 10,
    includetext: false,
  });
}

function buildEntries(items: BarcodeSheetItem[]): Entry[] {
  const entries: Entry[] = [];
  const sorted = [...items].sort(
    (a, b) => a.program.localeCompare(b.program) || a.name.localeCompare(b.name)
  );
  for (const item of sorted) {
    if (item.manualPrice) {
      entries.push({
        barcodeText: `ITEM-${item.code}`,
        label: item.name,
        subLabel: "enter $ at scan",
        kind: "item",
        program: item.program,
      });
    } else {
      entries.push({
        barcodeText: `ITEM-${item.code}-NEW`,
        label: item.name,
        subLabel: `NEW $${(item.newPrice ?? 0).toFixed(2)}`,
        kind: "item",
        program: item.program,
      });
      if (item.usedPrice != null) {
        entries.push({
          barcodeText: `ITEM-${item.code}-USED`,
          label: item.name,
          subLabel: `USED $${item.usedPrice.toFixed(2)}`,
          kind: "item",
          program: item.program,
        });
      }
    }
  }
  entries.push({ barcodeText: "ACTION-UNDO", label: "Undo Last Scan", subLabel: "", kind: "action", program: null });
  entries.push({
    barcodeText: "ACTION-FINISH",
    label: "Finish Donation",
    subLabel: "",
    kind: "action",
    program: null,
  });
  return entries;
}

function drawCentered(page: PDFPage, text: string, centerX: number, y: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - width / 2, y, size, font, color });
}

export async function generateBarcodeSheetPdf(items: BarcodeSheetItem[]): Promise<Uint8Array> {
  const entries = buildEntries(items);

  // Pre-render every barcode PNG once, then embed as needed.
  const pngs = new Map<string, Buffer>();
  for (const e of entries) {
    pngs.set(e.barcodeText, await barcodePng(e.barcodeText));
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const imageCache = new Map<string, PDFImage>();
  async function embeddedImage(text: string): Promise<PDFImage> {
    if (!imageCache.has(text)) {
      imageCache.set(text, await doc.embedPng(pngs.get(text)!));
    }
    return imageCache.get(text)!;
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  let col = 0;
  let row = 0;
  let currentProgram: string | null | undefined = undefined; // undefined = "not yet set" sentinel

  function drawHeader(subtitle?: string) {
    page.drawText("ICNA Relief \u2014 Donation Intake Barcode Sheet", { x: MARGIN, y: PAGE_H - MARGIN + 8, size: 14, font: bold });
    page.drawText(
      "Scan an item's NEW or USED code once per unit. ACTION-FINISH closes out the donation.",
      { x: MARGIN, y: PAGE_H - MARGIN - 6, size: 8, font, color: rgb(0.35, 0.35, 0.35) }
    );
    if (subtitle) {
      page.drawText(subtitle, { x: MARGIN, y: PAGE_H - MARGIN - 20, size: 9, font: bold });
    }
  }

  function newPage(subtitle?: string) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    drawHeader(subtitle);
    y = PAGE_H - MARGIN - HEADER_H;
    row = 0;
    col = 0;
  }

  drawHeader();
  y = PAGE_H - MARGIN - HEADER_H;

  for (const e of entries) {
    // Section header whenever the program changes (items are pre-sorted by program)
    if (e.kind === "item" && e.program !== currentProgram) {
      currentProgram = e.program;
      if (col !== 0) {
        col = 0;
        row++;
      }
      const sectionY = y - row * (CELL_H + GUTTER);
      if (sectionY - SECTION_H - CELL_H < MARGIN) {
        newPage(currentProgram ?? undefined);
      } else {
        page.drawText(currentProgram ?? "", { x: MARGIN, y: sectionY - SECTION_H + 8, size: 11, font: bold, color: BRAND });
        y = sectionY - SECTION_H;
        row = 0;
      }
    }

    if (e.kind === "action" && currentProgram !== null) {
      if (col !== 0) {
        col = 0;
        row++;
      }
      const sectionY = y - row * (CELL_H + GUTTER);
      if (sectionY - SECTION_H - CELL_H < MARGIN) {
        newPage("Controls");
      } else {
        page.drawText("Controls", { x: MARGIN, y: sectionY - SECTION_H + 8, size: 11, font: bold, color: RED });
        y = sectionY - SECTION_H;
        row = 0;
      }
      currentProgram = null; // only draw the Controls header once
    }

    const cellX = MARGIN + col * (CELL_W + GUTTER);
    let cellY = y - row * (CELL_H + GUTTER);

    if (cellY - CELL_H < MARGIN) {
      newPage(e.kind === "item" ? currentProgram ?? undefined : "Controls");
      cellY = y;
    }

    const boxColor = e.kind === "item" ? DARK : RED;
    page.drawRectangle({
      x: cellX,
      y: cellY - CELL_H,
      width: CELL_W,
      height: CELL_H,
      borderColor: boxColor,
      borderWidth: 1,
    });

    const img = await embeddedImage(e.barcodeText);
    const imgW = CELL_W - 14;
    const imgH = 32;
    page.drawImage(img, {
      x: cellX + (CELL_W - imgW) / 2,
      y: cellY - 14 - imgH,
      width: imgW,
      height: imgH,
    });

    drawCentered(page, e.label.slice(0, 26), cellX + CELL_W / 2, cellY - CELL_H + 24, 8, bold, boxColor);
    if (e.subLabel) {
      drawCentered(page, e.subLabel, cellX + CELL_W / 2, cellY - CELL_H + 12, 7, font, rgb(0.35, 0.35, 0.35));
    }

    col++;
    if (col >= COLS) {
      col = 0;
      row++;
    }
  }

  return doc.save();
}
