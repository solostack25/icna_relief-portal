import { createAdminClient } from "@/lib/supabase/server";
import { candidateDevices, keyPoolSummary, officeLookup, PRO_OR_BETTER } from "@/lib/devices/windowsUpgrade";
import WindowsUpgradeClient from "./WindowsUpgradeClient";

export const dynamic = "force-dynamic";

export default async function WindowsUpgradePage() {
  const admin = createAdminClient();
  const [devices, pool, { data: upgrades }, { data: keys }, { data: offices }, { data: emps }, officeByUpn] = await Promise.all([
    candidateDevices(),
    keyPoolSummary(),
    admin
      .from("win_upgrades")
      .select("id, device_key, device_name, serial_number, employee_id, owner_upn, office_id, key_id, status, reported_edition, steps, blocked_reason, created_at, updated_at, completed_at, key:win_license_keys(license_type, key_last5)")
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false }),
    admin.from("win_license_keys").select("id, product, license_type, key_last5, activations_total, activations_used, status, purchase_ref, created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("b2s_offices").select("id, field_office, state"),
    admin.from("employees").select("id, first_name, last_name, email, assigned_office_id"),
    officeLookup(),
  ]);
  const staleCutoff = Date.now() - 90 * 864e5;
  const officeName = new Map<string, string>((offices ?? []).map((o: any) => [o.id, `${o.field_office}${o.state ? `, ${o.state}` : ""}`]));
  const empById = new Map<string, any>((emps ?? []).map((e: any) => [e.id, e]));

  const rows = devices.map((d: any) => {
    const e = d.employee_id ? empById.get(d.employee_id) : null;
    const edition: string = d.windows_edition ?? (d.trust_type === "Workplace" && !d.intune_id ? "Unknown (registered)" : "Unknown");
    return {
      deviceKey: d.device_key,
      name: d.display_name,
      model: [d.manufacturer, d.model].filter(Boolean).join(" ") || null,
      serial: d.serial_number,
      person: e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : d.owner_name ?? d.owner_upn ?? null,
      employeeId: d.employee_id,
      office: (e?.assigned_office_id ? officeName.get(e.assigned_office_id) : null) ?? (d.owner_upn ? officeByUpn.get(String(d.owner_upn).toLowerCase())?.officeName : null) ?? null,
      active: !!d.approx_last_sign_in && new Date(d.approx_last_sign_in).getTime() > staleCutoff,
      edition,
      editionSource: d.edition_source,
      joined: d.trust_type === "AzureAd",
      managed: !!d.intune_id,
      needsUpgrade: !d.windows_edition ? !(d.trust_type === "AzureAd" && d.intune_id) : !PRO_OR_BETTER.has(d.windows_edition),
      lastSeen: d.approx_last_sign_in,
    };
  });

  const ups = (upgrades ?? []).map((u: any) => {
    const e = u.employee_id ? empById.get(u.employee_id) : null;
    return {
      ...u,
      person: e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : u.owner_upn ?? null,
      personEmail: e?.email ?? u.owner_upn ?? null,
      office: (u.office_id ? officeName.get(u.office_id) : null) ?? (u.owner_upn ? officeByUpn.get(String(u.owner_upn).toLowerCase())?.officeName : null) ?? null,
    };
  });

  return <WindowsUpgradeClient devices={rows} upgrades={ups} keys={keys ?? []} pool={pool} />;
}
