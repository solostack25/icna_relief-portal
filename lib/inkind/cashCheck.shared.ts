// Types + pure helpers for cash/check donations, safe to import from
// client components (no server-only imports).

export type CashDonationRow = {
  id: string;
  receipt_number: string;
  office_id: string | null;
  office: string | null;
  method: "cash" | "check";
  amount: number;
  date_received: string;
  check_number: string | null;
  check_image_path: string | null;
  check_image_blurred: boolean;
  donor_kind: "individual" | "organization" | "anonymous";
  donor_first_name: string | null;
  donor_last_name: string | null;
  donor_org_name: string | null;
  donor_email: string | null;
  donor_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  email_receipt: boolean;
  receipt_sent_at: string | null;
  receipt_error: string | null;
  status: "received" | "batched" | "synced";
  money_order_id: string | null;
  salesforce_record_id: string | null;
  synced_at: string | null;
  sync_error: string | null;
  pii_purged_at: string | null;
  created_at: string;
};

export type MoneyOrderRow = {
  id: string;
  office_id: string | null;
  office: string | null;
  money_order_number: string;
  amount: number;
  donations_total: number;
  purchased_on: string;
  notes: string | null;
  created_at: string;
  pushed_at: string | null;
};

export function donorDisplayName(d: Pick<CashDonationRow, "donor_kind" | "donor_first_name" | "donor_last_name" | "donor_org_name" | "pii_purged_at">): string {
  if (d.pii_purged_at) return "In Salesforce";
  if (d.donor_kind === "anonymous") return "Anonymous";
  if (d.donor_kind === "organization") return d.donor_org_name || "Organization";
  return [d.donor_first_name, d.donor_last_name].filter(Boolean).join(" ") || "—";
}

export function money(n: number): string {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Cents math so batch totals never drift from float rounding.
export function sumAmounts(rows: { amount: number | string }[]): number {
  return rows.reduce((c, r) => c + Math.round(Number(r.amount) * 100), 0) / 100;
}
