// Builds the two invoice shapes out of a completed session's donation rows:
//
// - ONE donor-facing invoice per session: itemized by name/condition/qty,
//   no dollar amounts.
// - ONE backend invoice PER PROGRAM touched in that session: only that
//   program's items, with $ amounts, numbered as the session's invoice_id
//   + "-" + that program's code (e.g. TXHOU-07202026-001-RCS). A session
//   that touched 2 programs produces 2 backend invoices.
//
// This file only builds plain data — see renderInvoicePdf.ts for turning
// this into an actual PDF.

import type { DonationRow } from "./fetchSessions";
import { lineTotal } from "./fetchSessions";

export type SessionForInvoice = {
  id: string;
  invoice_id: string | null;
  office: string | null;
  short_description: string | null;
  date_received: string | null;
  donor_kind: string | null;
  donor_org_name: string | null;
  completed_at: string | null;
};

export type DonorForInvoice = {
  name: string | null;
  email: string | null;
  address: string | null;
  signature_data: string | null;
} | null;

export type InvoiceLine = {
  name: string;
  condition: "new" | "used" | "na";
  qty: number;
  notes: string | null;
};

export type PricedInvoiceLine = InvoiceLine & {
  unitPrice: number;
  isManualPrice: boolean;
  total: number;
};

export type DonorInvoiceData = {
  invoiceNumber: string;
  office: string | null;
  dateReceived: string | null;
  donorLabel: string;
  lines: InvoiceLine[];
  totalItems: number;
  signatureDataUrl: string | null;
  disclaimer: string | null;
};

export type BackendInvoiceData = {
  invoiceNumber: string;
  program: string;
  programCode: string;
  office: string | null;
  dateReceived: string | null;
  donorLabel: string;
  lines: PricedInvoiceLine[];
  subtotal: number;
};

function donorLabelFor(session: SessionForInvoice, donor: DonorForInvoice): string {
  if (session.donor_kind === "anonymous") return "Anonymous Individual";
  return donor?.name || session.donor_org_name || "Anonymous";
}

export function buildDonorInvoice(
  session: SessionForInvoice,
  donor: DonorForInvoice,
  donations: DonationRow[],
  disclaimer: string | null = null
): DonorInvoiceData {
  const lines: InvoiceLine[] = donations
    .filter((d) => d.qty > 0)
    .map((d) => ({ name: d.item_name, condition: d.condition, qty: d.qty, notes: d.notes }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    invoiceNumber: session.invoice_id ?? session.id.slice(0, 8),
    office: session.office,
    dateReceived: session.date_received,
    donorLabel: donorLabelFor(session, donor),
    lines,
    totalItems: lines.reduce((a, l) => a + l.qty, 0),
    signatureDataUrl: donor?.signature_data ?? null,
    disclaimer,
  };
}

export function buildBackendInvoices(
  session: SessionForInvoice,
  donor: DonorForInvoice,
  donations: DonationRow[]
): BackendInvoiceData[] {
  const byProgram = new Map<string, DonationRow[]>();
  donations
    .filter((d) => d.qty > 0)
    .forEach((d) => {
      const key = d.program;
      if (!byProgram.has(key)) byProgram.set(key, []);
      byProgram.get(key)!.push(d);
    });

  const baseInvoiceNumber = session.invoice_id ?? session.id.slice(0, 8);
  const donorLabel = donorLabelFor(session, donor);

  return Array.from(byProgram.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([program, rows]) => {
      const programCode = rows[0]?.program_code ?? "GEN";
      const lines: PricedInvoiceLine[] = rows
        .map((d) => ({
          name: d.item_name,
          condition: d.condition,
          qty: d.qty,
          notes: d.notes,
          unitPrice: d.unit_price,
          isManualPrice: d.is_manual_price,
          total: lineTotal(d),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        invoiceNumber: `${baseInvoiceNumber}-${programCode}`,
        program,
        programCode,
        office: session.office,
        dateReceived: session.date_received,
        donorLabel,
        lines,
        subtotal: lines.reduce((a, l) => a + l.total, 0),
      };
    });
}
