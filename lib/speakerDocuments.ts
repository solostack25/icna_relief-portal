import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Agreement text + calendar invite generation for Speaker Requests.
// The agreement wording lives here in one place so it can be revised
// (or swapped for a DocuSign template later) without touching the
// workflow engine.

export type AgreementInput = {
  requestNumber: string;
  speakerName: string;
  eventLabel: string; // "Weekly Jummah Khutbah" / "Special Program: ..."
  eventWhen: string; // already formatted in the event's timezone
  location: string;
  honorarium: number;
  travelRequired: boolean;
  travelCost: number;
  hotelCost: number;
  coordinatorName: string;
  coordinatorEmail: string;
};

export const money = (n: number) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function agreementSections(a: AgreementInput): { title: string; body: string }[] {
  const sections = [
    {
      title: "1. Engagement",
      body: `ICNA Relief USA ("ICNA Relief") engages ${a.speakerName} ("Speaker") to deliver the ${a.eventLabel} on ${a.eventWhen} at ${a.location}. The ICNA Relief point of contact is ${a.coordinatorName} (${a.coordinatorEmail}).`,
    },
    {
      title: "2. Honorarium",
      body: `ICNA Relief will pay Speaker an honorarium of ${money(a.honorarium)} for this engagement. Payment is issued by ICNA Relief Finance after the event, once a completed IRS Form W-9 is on file. Speaker is an independent contractor, not an employee, and is responsible for any taxes owed on this payment.`,
    },
  ];
  if (a.travelRequired) {
    sections.push({
      title: "3. Travel & Lodging",
      body: `ICNA Relief has approved travel costs up to ${money(a.travelCost)} and lodging up to ${money(a.hotelCost)} for this engagement. Bookings are coordinated through the ICNA Relief point of contact. Costs beyond these approved amounts, or not arranged with the point of contact, are not covered unless approved in writing in advance.`,
    });
  }
  sections.push(
    {
      title: `${a.travelRequired ? 4 : 3}. Cancellation`,
      body: "Either party may cancel with reasonable notice. If ICNA Relief cancels within 48 hours of the event for reasons not caused by Speaker, any non-refundable travel already booked by ICNA Relief remains ICNA Relief's cost. If Speaker cannot attend, Speaker will notify the point of contact as early as possible.",
    },
    {
      title: `${a.travelRequired ? 5 : 4}. Conduct`,
      body: "Speaker agrees that content delivered will be consistent with ICNA Relief's mission and values, and will not be used to solicit funds for any other organization during the event without prior written consent.",
    },
    {
      title: `${a.travelRequired ? 6 : 5}. Electronic Signature`,
      body: "By typing their full name and submitting this agreement through the ICNA Relief portal, Speaker agrees that the electronic signature is the legal equivalent of a handwritten signature.",
    }
  );
  return sections;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// pdf-lib's standard fonts are WinAnsi only - strip anything outside
// that range so a name with an unusual character can't crash the PDF.
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

export async function buildAgreementPdf(a: AgreementInput, signature?: { name: string; signedAt: Date; ip: string | null }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.086, 0.188, 0.169);
  const emerald = rgb(0.122, 0.435, 0.329);
  const dim = rgb(0.4, 0.47, 0.45);

  let page: PDFPage = pdf.addPage([612, 792]);
  const margin = 56;
  const width = 612 - margin * 2;
  let y = 792 - margin;

  const ensure = (h: number) => {
    if (y - h < margin) {
      page = pdf.addPage([612, 792]);
      y = 792 - margin;
    }
  };
  const text = (t: string, f: PDFFont, size: number, color = ink, gap = 4) => {
    for (const line of wrap(safe(t), f, size, width)) {
      ensure(size + gap);
      page.drawText(line, { x: margin, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };

  text("ICNA RELIEF USA", bold, 10, emerald, 6);
  text("Speaker Agreement", italic, 24, ink, 8);
  text(`Reference ${a.requestNumber}`, font, 10, dim, 14);

  for (const s of agreementSections(a)) {
    y -= 6;
    text(s.title, bold, 12, ink, 6);
    text(s.body, font, 10.5, ink, 4);
  }

  y -= 24;
  ensure(90);
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.8, color: dim });
  if (signature) {
    page.drawText(safe(signature.name), { x: margin + 4, y: y + 6, size: 20, font: italic, color: ink });
  }
  y -= 14;
  text(`Speaker signature${signature ? ` - signed electronically by ${signature.name}` : ""}`, font, 9, dim, 3);
  if (signature) {
    text(`Signed ${signature.signedAt.toISOString().replace("T", " ").slice(0, 19)} UTC${signature.ip ? ` from IP ${signature.ip}` : ""}`, font, 9, dim, 3);
  }

  return Buffer.from(await pdf.save());
}

// ---------- Calendar invite (.ics) ----------

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
// RFC 5545 lines must be folded at 75 octets.
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(opts: { uid: string; start: Date; durationMinutes: number; summary: string; description: string; location: string }): Buffer {
  const end = new Date(opts.start.getTime() + opts.durationMinutes * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ICNA Relief//Speaker Requests//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@icnarelief.org`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(opts.summary)}`,
    `DESCRIPTION:${icsEscape(opts.description)}`,
    `LOCATION:${icsEscape(opts.location)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(fold);
  return Buffer.from(lines.join("\r\n") + "\r\n", "utf8");
}
