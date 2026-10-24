"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Extra questions on an IT "Hardware Request": where to ship it, and
// whether it's a grant-related purchase (picked from the active grants
// in Grant Management). Used by both the plain form (/helpdesk/new) and
// the guided wizard's review step so they ask exactly the same thing.

export const HARDWARE_CATEGORY = "Hardware Request";

export type HardwareGrant = { id: string; code: string; name: string; funder: string; office_id: string | null; start_date: string; end_date: string };

export type HardwareValue = {
  ship_to_name: string;
  ship_address_line1: string;
  ship_address_line2: string;
  ship_city: string;
  ship_state: string;
  ship_zip: string;
  is_grant_purchase: "" | "yes" | "no";
  gm_grant_id: string;
  /** Grant orders only: one row per device type. Strings while editing. */
  line_items: HardwareLineDraft[];
};

export type HardwareLineDraft = { description: string; quantity: string; unit_price: string };
const emptyLine = (): HardwareLineDraft => ({ description: "", quantity: "1", unit_price: "" });

const lineIsBlank = (l: HardwareLineDraft) => !l.description.trim() && !l.unit_price.trim() && (!l.quantity.trim() || l.quantity.trim() === "1");
const parseMoney = (s: string) => Number(s.replace(/[$,\s]/g, ""));
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Filled rows, parsed. Blank rows are ignored.
export function hardwareLineItems(v: HardwareValue) {
  if (v.is_grant_purchase !== "yes") return [];
  return v.line_items
    .filter((l) => !lineIsBlank(l))
    .map((l, i) => ({ description: l.description.trim(), quantity: Math.round(Number(l.quantity)), unit_price: Math.round(parseMoney(l.unit_price) * 100) / 100, sort_order: i }));
}

export function lineItemsTotal(items: { quantity: number; unit_price: number }[]) {
  return Math.round(items.reduce((s, l) => s + l.quantity * l.unit_price, 0) * 100) / 100;
}

export const emptyHardware = (name = ""): HardwareValue => ({
  ship_to_name: name,
  ship_address_line1: "",
  ship_address_line2: "",
  ship_city: "",
  ship_state: "",
  ship_zip: "",
  is_grant_purchase: "",
  gm_grant_id: "",
  line_items: [emptyLine()],
});

export function validateHardware(v: HardwareValue, grants: HardwareGrant[]): string | null {
  if (!v.ship_to_name.trim()) return "Who should the hardware be shipped to?";
  if (!v.ship_address_line1.trim() || !v.ship_city.trim() || !v.ship_state.trim() || !v.ship_zip.trim()) {
    return "Enter the full shipping address (street, city, state and ZIP).";
  }
  if (!/^\d{5}(-\d{4})?$/.test(v.ship_zip.trim())) return "Enter a valid ZIP code.";
  if (!v.is_grant_purchase) return "Is this a grant-related purchase? Choose Yes or No.";
  if (v.is_grant_purchase === "yes" && grants.length > 0 && !grants.some((g) => g.id === v.gm_grant_id)) {
    return "Pick the grant this purchase is for.";
  }
  if (v.is_grant_purchase === "yes") {
    for (const [i, l] of v.line_items.entries()) {
      if (lineIsBlank(l)) continue;
      const n = i + 1;
      if (!l.description.trim()) return `Line ${n}: what device is it?`;
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q < 1) return `Line ${n}: quantity must be a whole number of at least 1.`;
      const p = parseMoney(l.unit_price);
      if (!l.unit_price.trim() || !Number.isFinite(p) || p < 0) return `Line ${n}: enter the price per device.`;
    }
  }
  return null;
}

// Row for helpdesk_leg_details_it.
export function hardwareDetails(v: HardwareValue, grants: HardwareGrant[]) {
  const grant = v.is_grant_purchase === "yes" ? grants.find((g) => g.id === v.gm_grant_id) ?? null : null;
  return {
    ship_to_name: v.ship_to_name.trim(),
    ship_address_line1: v.ship_address_line1.trim(),
    ship_address_line2: v.ship_address_line2.trim() || null,
    ship_city: v.ship_city.trim(),
    ship_state: v.ship_state.trim().toUpperCase(),
    ship_zip: v.ship_zip.trim(),
    is_grant_purchase: v.is_grant_purchase === "yes",
    gm_grant_id: grant?.id ?? null,
    grant_name: grant ? `${grant.code} · ${grant.name}` : null,
  };
}

export function useActiveGrants() {
  const [grants, setGrants] = useState<HardwareGrant[]>([]);
  useEffect(() => {
    fetch("/api/helpdesk/grants")
      .then((r) => r.json())
      .then((d) => setGrants(d.grants ?? []))
      .catch(() => {});
  }, []);
  return grants;
}

type LastAddress = Pick<HardwareValue, "ship_to_name" | "ship_address_line1" | "ship_address_line2" | "ship_city" | "ship_state" | "ship_zip">;

// The address on this person's most recent hardware request, offered as a one-tap fill.
function useLastAddress(email: string) {
  const [last, setLast] = useState<LastAddress | null>(null);
  useEffect(() => {
    if (!email) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("helpdesk_leg_details_it")
        .select(
          "ship_to_name, ship_address_line1, ship_address_line2, ship_city, ship_state, ship_zip, helpdesk_request_legs!inner(created_at, helpdesk_requests!inner(submitted_by_email))"
        )
        .eq("helpdesk_request_legs.helpdesk_requests.submitted_by_email", email)
        .not("ship_address_line1", "is", null)
        .limit(25);
      const rows = ((data ?? []) as unknown as (LastAddress & { helpdesk_request_legs: { created_at: string } })[]).sort((a, b) =>
        b.helpdesk_request_legs.created_at.localeCompare(a.helpdesk_request_legs.created_at)
      );
      if (rows[0]) {
        const r = rows[0];
        setLast({
          ship_to_name: r.ship_to_name ?? "",
          ship_address_line1: r.ship_address_line1 ?? "",
          ship_address_line2: r.ship_address_line2 ?? "",
          ship_city: r.ship_city ?? "",
          ship_state: r.ship_state ?? "",
          ship_zip: r.ship_zip ?? "",
        });
      }
    })();
  }, [email]);
  return last;
}

const inputCls = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";
const labelCls = "block text-sm font-medium mb-1.5";

export default function HardwareRequestFields({
  value,
  onChange,
  grants,
  submitterEmail,
}: {
  value: HardwareValue;
  onChange: (v: HardwareValue) => void;
  grants: HardwareGrant[];
  submitterEmail: string;
}) {
  const last = useLastAddress(submitterEmail);
  const set = (patch: Partial<HardwareValue>) => onChange({ ...value, ...patch });
  const chosen = grants.find((g) => g.id === value.gm_grant_id) ?? null;
  const sameAsLast =
    !!last && last.ship_address_line1 === value.ship_address_line1 && last.ship_zip === value.ship_zip && last.ship_city === value.ship_city;
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-5 rounded-xl border border-[var(--color-border)] p-4">
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-sm font-semibold">Shipping address *</div>
          {last && !sameAsLast && (
            <button type="button" onClick={() => set(last)} className="text-xs font-medium text-[var(--color-accent)] hover:underline cursor-pointer">
              Use my last address
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Ship to (name)</label>
            <input value={value.ship_to_name} onChange={(e) => set({ ship_to_name: e.target.value })} className={inputCls} autoComplete="name" />
          </div>
          <div>
            <label className={labelCls}>Street address</label>
            <input value={value.ship_address_line1} onChange={(e) => set({ ship_address_line1: e.target.value })} className={inputCls} autoComplete="address-line1" />
          </div>
          <div>
            <label className={labelCls}>
              Suite / unit <span className="font-normal text-[var(--color-text-dim)]">(optional)</span>
            </label>
            <input value={value.ship_address_line2} onChange={(e) => set({ ship_address_line2: e.target.value })} className={inputCls} autoComplete="address-line2" />
          </div>
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <label className={labelCls}>City</label>
              <input value={value.ship_city} onChange={(e) => set({ ship_city: e.target.value })} className={inputCls} autoComplete="address-level2" />
            </div>
            <div className="col-span-1">
              <label className={labelCls}>State</label>
              <input
                value={value.ship_state}
                onChange={(e) => set({ ship_state: e.target.value.toUpperCase().slice(0, 2) })}
                className={inputCls}
                autoComplete="address-level1"
                placeholder="TX"
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>ZIP</label>
              <input value={value.ship_zip} onChange={(e) => set({ ship_zip: e.target.value })} className={inputCls} inputMode="numeric" autoComplete="postal-code" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Is this a grant-related purchase? *</div>
        <div className="grid grid-cols-2 gap-2">
          {(["yes", "no"] as const).map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => set({ is_grant_purchase: opt, gm_grant_id: opt === "no" ? "" : value.gm_grant_id })}
              className={`text-sm py-2 rounded-lg border cursor-pointer ${
                value.is_grant_purchase === opt
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)]"
              }`}
            >
              {opt === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>

        {value.is_grant_purchase === "yes" &&
          (grants.length > 0 ? (
            <div className="mt-3">
              <label className={labelCls}>Which grant?</label>
              <select value={value.gm_grant_id} onChange={(e) => set({ gm_grant_id: e.target.value })} className={inputCls}>
                <option value="">Select a grant…</option>
                {grants.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
              {chosen && (
                <p className="text-xs text-[var(--color-text-dim)] mt-1.5">
                  {chosen.funder} · grant period {fmt(chosen.start_date)} – {fmt(chosen.end_date)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-dim)] mt-2">
              No active grants are set up in Grant Management yet. Name the grant in the description and IT will confirm it with the grant team.
            </p>
          ))}

        {value.is_grant_purchase === "yes" && <LineItemsEditor items={value.line_items} onChange={(line_items) => set({ line_items })} />}
      </div>
    </div>
  );
}

// Grant orders are often several devices at once: one row per device
// type with quantity and price each, totalled for the approvers.
function LineItemsEditor({ items, onChange }: { items: HardwareLineDraft[]; onChange: (items: HardwareLineDraft[]) => void }) {
  const update = (i: number, patch: Partial<HardwareLineDraft>) => onChange(items.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(items.length > 1 ? items.filter((_, j) => j !== i) : [emptyLine()]);
  const lineTotal = (l: HardwareLineDraft) => {
    const q = Number(l.quantity);
    const p = parseMoney(l.unit_price);
    return Number.isFinite(q) && Number.isFinite(p) && l.unit_price.trim() ? q * p : null;
  };
  const total = items.reduce((s, l) => s + (lineTotal(l) ?? 0), 0);

  return (
    <div className="mt-4">
      <div className="text-sm font-semibold mb-1">Devices on this order</div>
      <p className="text-xs text-[var(--color-text-dim)] mb-2">Add a line for each device type: what it is, how many, and the price for one.</p>
      <div className="space-y-2">
        {items.map((l, i) => {
          const lt = lineTotal(l);
          return (
            <div key={i} className="rounded-lg border border-[var(--color-border)] p-2.5">
              <div className="flex gap-2 items-start">
                <input
                  value={l.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder="Device, e.g. Dell Latitude 5450 laptop"
                  className={inputCls}
                  aria-label={`Line ${i + 1} device`}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-xs text-[var(--color-text-dim)] hover:text-red-600 px-2 py-2 cursor-pointer"
                  aria-label={`Remove line ${i + 1}`}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 items-center">
                <label className="text-xs text-[var(--color-text-dim)]">
                  Qty
                  <input value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" className={inputCls} />
                </label>
                <label className="text-xs text-[var(--color-text-dim)]">
                  Price each
                  <input value={l.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} inputMode="decimal" placeholder="$0.00" className={inputCls} />
                </label>
                <div className="text-xs text-[var(--color-text-dim)] text-right">
                  Line total
                  <div className="text-sm font-semibold text-[var(--color-text)] mt-1.5">{lt == null ? "—" : money(lt)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2">
        <button type="button" onClick={() => onChange([...items, emptyLine()])} className="text-xs font-medium text-[var(--color-accent)] hover:underline cursor-pointer">
          + Add another device
        </button>
        <div className="text-sm">
          Order total <span className="font-semibold">{money(total)}</span>
        </div>
      </div>
    </div>
  );
}
