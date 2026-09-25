import { ASSETS, type AssetConfig } from "./schema";

/** Turn a Postgres error into something a staff member can act on. */
export function friendlyDbError(e: { code?: string; message?: string } | null | undefined) {
  if (!e) return "Something went wrong.";
  if (e.code === "23505" && e.message?.includes("vin")) return "A vehicle with that VIN is already in the system.";
  if (e.code === "23514") {
    if (e.message?.includes("vin")) return "VIN must be exactly 17 letters/numbers (no I, O or Q).";
    if (e.message?.includes("state")) return "State must be a 2-letter code, like TX.";
    if (e.message?.includes("zip")) return "ZIP must be 5 digits.";
    if (e.message?.includes("license_last4")) return "Enter only the last 4 characters of the license number.";
    return "One of the values isn't valid. Please check the form.";
  }
  if (e.code === "42501" || e.message?.includes("row-level security")) return "You don't have permission to change records for that office.";
  if (e.message?.includes("only_managers_can_set_status")) return "Only the insurance team (Admin / IT) can move a request past Submitted.";
  return e.message ?? "Something went wrong.";
}

export const ASSET_TITLE_SELECT = "res_vehicles(year, make, model, plate), res_properties(name, city), res_drivers(full_name)";

/** Title for a row that embeds res_vehicles / res_properties / res_drivers. */
export function embeddedAssetTitle(r: Record<string, any>) {
  if (r.res_vehicles) return { type: "vehicles", id: r.vehicle_id, title: ASSETS.vehicles.title(r.res_vehicles) };
  if (r.res_properties) return { type: "properties", id: r.property_id, title: ASSETS.properties.title(r.res_properties) };
  if (r.res_drivers) return { type: "drivers", id: r.driver_id, title: ASSETS.drivers.title(r.res_drivers) };
  return { type: null, id: null, title: "(asset)" };
}

export const fkFor = (cfg: AssetConfig) => cfg.fk;

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(","))].join("\n");
}
