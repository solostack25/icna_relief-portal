// Config-driven field definitions for the 5 "single record" Finance
// Ticket categories (everything except Credit Card and Mileage,
// which are batch/line-item shaped - see NewFinanceTicketClient.tsx's
// dedicated builders for those instead). Same "config, not code"
// pattern as lib/reports/registry.ts.
//
// Field keys match the corresponding finance_* table's column names
// (snake_case) so the API route can insert the submitted detail
// object directly without a translation layer.
//
// This registry was corrected against the actual uploaded PowerApps
// Canvas App screen source (CanvasApps/*.pa.yaml), not just the flat
// schema.txt entity dump - the entity dump over- and under-includes
// fields relative to what a user is actually asked (e.g. every
// category has a Grant lookup shown only when Grant Eligible is
// checked, which wasn't in schema.txt at all; Honorarium's POC
// fields aren't a single free-text field but branch between a
// searchable employee lookup and free text depending on "Is POC an
// ICNA Relief Member?").

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "office" | "employee" | "pex_card" | "grant" | "multitext";

export type TicketField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Only rendered when the field at dependsOn.key currently equals
   *  dependsOn.equals - powers the branching the real forms do (e.g.
   *  POC User lookup vs POC Name text, Grant picker only when Grant
   *  Eligible is checked, "Name of Other Utility" only when Utility
   *  Type = Other). */
  dependsOn?: { key: string; equals: unknown };
};

export const HONORARIUM_FIELDS: TicketField[] = [
  { key: "speaker_or_agency_name", label: "Speaker or Agency", type: "text", required: true },
  { key: "is_icna_speaker_list", label: "Is the speaker part of ICNA Relief's speaker list?", type: "checkbox" },
  { key: "event_date", label: "Event Date", type: "date" },
  { key: "billing_office_id", label: "Billing Office", type: "office" },
  { key: "billing_programs", label: "Billing Programs (comma separated)", type: "multitext" },
  { key: "grant_id", label: "Grant", type: "grant", dependsOn: { key: "grant_eligible", equals: true } },
  { key: "poc_is_icna_member", label: "Is POC an ICNA Relief Member?", type: "checkbox" },
  { key: "poc_user_id", label: "POC User", type: "employee", dependsOn: { key: "poc_is_icna_member", equals: true } },
  { key: "poc_name", label: "POC Name", type: "text", dependsOn: { key: "poc_is_icna_member", equals: false } },
  { key: "service_provided", label: "What service was provided?", type: "textarea" },
  { key: "payee_name", label: "Payee Name", type: "text" },
  { key: "payee_address_line1", label: "Payee Address", type: "text" },
  { key: "payee_city", label: "Payee City", type: "text" },
  { key: "payee_zip_code", label: "Payee Zip Code", type: "text" },
  { key: "service_cost", label: "Service Cost", type: "number" },
  { key: "travel_amount", label: "Travel Cost", type: "number" },
  { key: "lodging_cost", label: "Lodging Cost", type: "number" },
  { key: "miscellaneous_cost", label: "Miscellaneous Cost", type: "number" },
  { key: "miscellaneous_name", label: "Miscellaneous Cost Description", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const UTILITY_FIELDS: TicketField[] = [
  { key: "vendor_name", label: "Vendor Name", type: "text", required: true },
  {
    key: "utility_type",
    label: "Utility Type",
    type: "select",
    options: [
      { value: "electricity", label: "Electricity" },
      { value: "water_sewer", label: "Water & Sewer" },
      { value: "gas_heating", label: "Gas & Heating" },
      { value: "internet_phone", label: "Internet & Phone" },
      { value: "security_alarm", label: "Security & Alarm" },
      { value: "trash_recycling", label: "Trash & Recycling" },
      { value: "other", label: "Other" },
    ],
  },
  { key: "other_utility_name", label: "Name of Other Utility", type: "text", dependsOn: { key: "utility_type", equals: "other" } },
  { key: "billing_office_id", label: "Billing Office", type: "office" },
  { key: "billing_programs", label: "Billing Programs (comma separated)", type: "multitext" },
  { key: "grant_id", label: "Grant", type: "grant", dependsOn: { key: "grant_eligible", equals: true } },
  { key: "expense_date", label: "Expense Date", type: "date" },
  { key: "poc_is_icna_member", label: "Is POC an ICNA Relief Member?", type: "checkbox" },
  { key: "poc_user_id", label: "POC User", type: "employee", dependsOn: { key: "poc_is_icna_member", equals: true } },
  { key: "poc_name", label: "POC Name", type: "text", dependsOn: { key: "poc_is_icna_member", equals: false } },
  { key: "service_location_name", label: "Service Location Name", type: "text" },
  { key: "service_address_line1", label: "Service Address", type: "text" },
  { key: "service_city", label: "Service City", type: "text" },
  { key: "service_zip_code", label: "Service Zip Code", type: "text" },
  { key: "pin_number", label: "Pin Number", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const VENDOR_FIELDS: TicketField[] = [
  { key: "vendor_name", label: "Vendor Name", type: "text", required: true },
  {
    key: "vendor_type",
    label: "Vendor Type",
    type: "select",
    options: [
      { value: "sponsors", label: "Sponsors" },
      { value: "convention", label: "Convention" },
      { value: "banquet", label: "Banquet" },
      { value: "ramadan", label: "Ramadan" },
      { value: "vehicle", label: "Vehicle" },
      { value: "food_bank", label: "Food Bank" },
      { value: "other", label: "Other" },
    ],
  },
  // Always shown on the real form, unlike Utility's equivalent field -
  // confirmed no conditional Visible property on this control.
  { key: "other_vendor_name", label: "Name of Other Vendor", type: "text" },
  { key: "billing_office_id", label: "Billing Office", type: "office" },
  { key: "billing_programs", label: "Billing Programs (comma separated)", type: "multitext" },
  { key: "grant_id", label: "Grant", type: "grant", dependsOn: { key: "grant_eligible", equals: true } },
  { key: "expense_date", label: "Expense Date", type: "date" },
  { key: "poc_is_icna_member", label: "Is POC an ICNA Relief Member?", type: "checkbox" },
  { key: "poc_user_id", label: "POC User", type: "employee", dependsOn: { key: "poc_is_icna_member", equals: true } },
  { key: "poc_name", label: "POC Name", type: "text", dependsOn: { key: "poc_is_icna_member", equals: false } },
  { key: "service_location_name", label: "Service Location Name", type: "text" },
  { key: "service_address_line1", label: "Service Address", type: "text" },
  { key: "service_zip_code", label: "Service Zip Code", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const PEX_NEW_REQUEST_FIELDS: TicketField[] = [
  { key: "office_id", label: "Office", type: "office", required: true },
  { key: "cellphone_number", label: "Cellphone Number", type: "text" },
  { key: "email_address", label: "Email Address", type: "text" },
  { key: "requestor_dob", label: "Date of Birth", type: "date" },
  {
    key: "send_to",
    label: "Send To",
    type: "select",
    options: [
      { value: "home", label: "Home" },
      { value: "office", label: "Office" },
    ],
  },
  { key: "home_address_line1", label: "Home Address", type: "text" },
  { key: "home_address_line2", label: "Home Apartment/Suite/Unit", type: "text" },
  { key: "home_city", label: "Home City", type: "text" },
  { key: "home_state", label: "Home State", type: "text" },
  { key: "home_zip_code", label: "Home Zip Code", type: "text" },
  { key: "office_address_line1", label: "Office Address", type: "text" },
  { key: "office_address_line2", label: "Office Apartment/Suite/Unit", type: "text" },
  { key: "office_city", label: "Office City", type: "text" },
  { key: "office_state", label: "Office State", type: "text" },
  { key: "office_zip_code", label: "Office Zip Code", type: "text" },
];

export const PEX_RECHARGE_REQUEST_FIELDS: TicketField[] = [
  { key: "billing_office_id", label: "Office", type: "office", required: true },
  { key: "pex_card_id", label: "Card", type: "pex_card", required: true },
  { key: "amount_to_add", label: "Amount to be Added", type: "number", required: true },
  { key: "current_balance", label: "Current Balance", type: "number" },
  { key: "supervisor_email", label: "Supervisor Email", type: "text" },
  { key: "funds_purpose", label: "Purpose of the Funds", type: "textarea" },
  { key: "submitted_receipts", label: "Have you submitted your receipts?", type: "checkbox" },
  { key: "validated_by_am_or_rd", label: "Has an AM or RD validated your receipts?", type: "checkbox" },
  { key: "no_invoice_reason", label: "If not, why not?", type: "textarea" },
];

export const SINGLE_RECORD_CATEGORIES: Record<string, { table: string; fields: TicketField[]; totalField?: string }> = {
  honorarium: { table: "finance_honorariums", fields: HONORARIUM_FIELDS, totalField: "total_amount" },
  utility_payment: { table: "finance_utilities", fields: UTILITY_FIELDS, totalField: "total_amount" },
  vendor_payment: { table: "finance_vendors", fields: VENDOR_FIELDS, totalField: "total_amount" },
  pex_new_card_request: { table: "finance_pex_new_requests", fields: PEX_NEW_REQUEST_FIELDS },
  pex_recharge_request: { table: "finance_pex_recharge_requests", fields: PEX_RECHARGE_REQUEST_FIELDS, totalField: "amount_to_add" },
};

export const CATEGORY_LABELS: Record<string, string> = {
  credit_card_reimbursement: "Credit Card Reimbursement",
  honorarium: "Honorarium",
  mileage_reimbursement: "Mileage Reimbursement",
  pex_new_card_request: "PEX New Card Request",
  pex_recharge_request: "PEX Recharge Request",
  utility_payment: "Utility Payment",
  vendor_payment: "Vendor Payment",
};

// Given the current values of a form (keyed by field.key) and a
// field's dependsOn condition, is this field currently relevant? Used
// by both the intake form and the resubmit-edit form so branching
// behaves identically in both places.
export function isFieldVisible(field: TicketField, values: Record<string, unknown>): boolean {
  if (!field.dependsOn) return true;
  return values[field.dependsOn.key] === field.dependsOn.equals;
}
