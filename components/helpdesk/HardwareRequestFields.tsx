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
};

export const emptyHardware = (name = ""): HardwareValue => ({
  ship_to_name: name,
  ship_address_line1: "",
  ship_address_line2: "",
  ship_city: "",
  ship_state: "",
  ship_zip: "",
  is_grant_purchase: "",
  gm_grant_id: "",
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
      </div>
    </div>
  );
}
