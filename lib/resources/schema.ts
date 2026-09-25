// Resources module: one config drives forms, lists, detail pages, CSV export and expiration alerts
// for vehicles, properties and drivers. Add a field here and it appears everywhere.

export type AssetType = "vehicles" | "properties" | "drivers";
export type FieldKind = "text" | "number" | "date" | "select" | "money" | "state" | "textarea" | "driver";

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  list?: boolean; // show as a column in the list
};

export type AssetConfig = {
  type: AssetType;
  table: "res_vehicles" | "res_properties" | "res_drivers";
  fk: "vehicle_id" | "property_id" | "driver_id";
  singular: string;
  plural: string;
  title: (row: Record<string, unknown>) => string;
  fields: Field[];
  /** Date fields that trigger 90/60/30-day expiration alerts. */
  expiries: { key: string; label: string }[];
};

const opt = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const ASSETS: Record<AssetType, AssetConfig> = {
  vehicles: {
    type: "vehicles",
    table: "res_vehicles",
    fk: "vehicle_id",
    singular: "Vehicle",
    plural: "Vehicles",
    title: (r) => [r.year, r.make, r.model].filter(Boolean).join(" ") || String(r.plate ?? "Vehicle"),
    fields: [
      { key: "year", label: "Year", kind: "number", list: true },
      { key: "make", label: "Make", kind: "text", required: true, list: true },
      { key: "model", label: "Model", kind: "text", required: true, list: true },
      { key: "vin", label: "VIN", kind: "text", placeholder: "17 characters", help: "Letters and numbers only (no I, O or Q)." },
      { key: "plate", label: "License plate", kind: "text", list: true },
      { key: "plate_state", label: "Plate state", kind: "state" },
      { key: "color", label: "Color", kind: "text" },
      { key: "ownership", label: "Ownership", kind: "select", options: opt(["owned", "Owned"], ["leased", "Leased"], ["donated", "Donated"]) },
      { key: "acquired_on", label: "Acquired on", kind: "date" },
      { key: "registration_expires_on", label: "Registration expires", kind: "date", list: true },
      { key: "primary_driver_id", label: "Primary driver", kind: "driver" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
    expiries: [{ key: "registration_expires_on", label: "Vehicle registration" }],
  },
  properties: {
    type: "properties",
    table: "res_properties",
    fk: "property_id",
    singular: "Property",
    plural: "Properties",
    title: (r) => String(r.name ?? "Property"),
    fields: [
      { key: "name", label: "Name", kind: "text", required: true, list: true, placeholder: "e.g. Hillcroft office" },
      {
        key: "property_type",
        label: "Type",
        kind: "select",
        list: true,
        options: opt(["office", "Office"], ["pantry", "Food pantry"], ["clinic", "Clinic"], ["warehouse", "Warehouse"], ["housing", "Housing"], ["other", "Other"]),
      },
      { key: "address1", label: "Street address", kind: "text", required: true },
      { key: "address2", label: "Suite / unit", kind: "text" },
      { key: "city", label: "City", kind: "text", required: true, list: true },
      { key: "state", label: "State", kind: "state", required: true },
      { key: "zip", label: "ZIP", kind: "text", placeholder: "5 digits" },
      { key: "ownership", label: "Ownership", kind: "select", list: true, options: opt(["owned", "Owned"], ["leased", "Leased"]) },
      { key: "landlord", label: "Landlord", kind: "text" },
      { key: "lease_start", label: "Lease start", kind: "date" },
      { key: "lease_end", label: "Lease end", kind: "date", list: true },
      { key: "monthly_rent", label: "Monthly rent", kind: "money" },
      { key: "square_feet", label: "Square feet", kind: "number" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
    expiries: [{ key: "lease_end", label: "Property lease" }],
  },
  drivers: {
    type: "drivers",
    table: "res_drivers",
    fk: "driver_id",
    singular: "Driver",
    plural: "Drivers",
    title: (r) => String(r.full_name ?? "Driver"),
    fields: [
      { key: "full_name", label: "Full name", kind: "text", required: true, list: true },
      { key: "email", label: "Email", kind: "text", list: true },
      { key: "phone", label: "Phone", kind: "text" },
      { key: "license_state", label: "License state", kind: "state" },
      {
        key: "license_last4",
        label: "License number (last 4 only)",
        kind: "text",
        placeholder: "e.g. 4821",
        help: "Only the last 4 characters are stored. Send full license details to the carrier through the insurance request.",
      },
      { key: "license_expires_on", label: "License expires", kind: "date", list: true },
      { key: "approved_on", label: "Approved to drive on", kind: "date" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
    expiries: [{ key: "license_expires_on", label: "Driver's license" }],
  },
};

export const isAssetType = (t: string): t is AssetType => t === "vehicles" || t === "properties" || t === "drivers";

/** Keep only known fields from a request body, normalized for the database. */
export function pickFields(cfg: AssetConfig, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of cfg.fields) {
    if (!(f.key in body)) continue;
    let v = body[f.key];
    if (typeof v === "string") v = v.trim();
    if (v === "" || v === undefined) v = null;
    if (v != null && (f.kind === "number" || f.kind === "money")) {
      const n = Number(v);
      v = Number.isFinite(n) ? n : null;
    }
    if (v != null && f.kind === "state") v = String(v).toUpperCase().slice(0, 2);
    if (v != null && f.key === "vin") v = String(v).toUpperCase().replace(/\s/g, "");
    if (v != null && f.key === "license_last4") v = String(v).replace(/\s/g, "").slice(-4);
    out[f.key] = v;
  }
  return out;
}

export function missingRequired(cfg: AssetConfig, row: Record<string, unknown>) {
  return cfg.fields.filter((f) => f.required && (row[f.key] == null || row[f.key] === "")).map((f) => f.label);
}

export const DOC_TYPES = [
  { value: "insurance_policy", label: "Insurance policy" },
  { value: "registration", label: "Vehicle registration" },
  { value: "property_record", label: "Property record" },
  { value: "lease", label: "Lease" },
  { value: "compliance_form", label: "Compliance form" },
  { value: "contract", label: "Contract" },
  { value: "certification", label: "Certification" },
  { value: "other", label: "Other" },
];

export const REQUEST_STATUSES = [
  { value: "draft", label: "Draft", color: "#6B7280" },
  { value: "submitted", label: "Submitted", color: "#2563EB" },
  { value: "under_review", label: "Under review", color: "#7C3AED" },
  { value: "sent_to_carrier", label: "Sent to insurance company", color: "#0E7490" },
  { value: "pending_response", label: "Pending response", color: "#B45309" },
  { value: "bound", label: "Approved / bound", color: "#15803D" },
  { value: "needs_correction", label: "Rejected / needs correction", color: "#B91C1C" },
  { value: "closed", label: "Closed", color: "#374151" },
] as const;
export const statusLabel = (s: string) => REQUEST_STATUSES.find((x) => x.value === s)?.label ?? s;
export const statusColor = (s: string) => REQUEST_STATUSES.find((x) => x.value === s)?.color ?? "#6B7280";
export const OPEN_STATUSES = ["draft", "submitted", "under_review", "sent_to_carrier", "pending_response", "needs_correction"];

export const US_STATES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
