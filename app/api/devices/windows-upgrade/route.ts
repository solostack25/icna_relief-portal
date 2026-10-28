import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { createAdminClient } from "@/lib/supabase/server";
import { importKeys, planUpgrades, assignKey, revealKey, setStep, refreshEmployeeDevices, syncWindowsEditions, audit, type LicenseType } from "@/lib/devices/windowsUpgrade";

export const maxDuration = 120;

// IT-only actions for the Windows 11 Pro upgrade program.
export async function POST(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    switch (b.action) {
      case "import_keys": {
        const t = b.licenseType as LicenseType;
        if (!["retail", "csp_perpetual", "oem", "mak"].includes(t)) throw new Error("Pick a license type.");
        return NextResponse.json(await importKeys({ text: String(b.text ?? ""), licenseType: t, product: b.product, purchaseRef: b.purchaseRef, makActivations: Number(b.makActivations) || 1, actorId: viewer.employeeId }));
      }
      case "revoke_key": {
        await createAdminClient().from("win_license_keys").update({ status: "revoked" }).eq("id", b.keyId);
        await audit({ keyId: b.keyId, actorId: viewer.employeeId, action: "key_revoked", detail: { reason: b.reason ?? null } });
        return NextResponse.json({ ok: true });
      }
      case "plan":
        return NextResponse.json(await planUpgrades(Array.isArray(b.deviceKeys) ? b.deviceKeys : [], viewer.employeeId));
      case "assign_key":
        return NextResponse.json({ keyId: await assignKey(b.upgradeId, viewer.employeeId, { allowMak: !!b.allowMak }) });
      case "reveal_key":
        return NextResponse.json(await revealKey(b.upgradeId, viewer.employeeId, { isIt: true }));
      case "set_step":
        await setStep(b.upgradeId, viewer.employeeId, b.step, b.value);
        return NextResponse.json({ ok: true });
      case "set_edition": {
        // IT confirmed the edition on the PC (for devices Intune can't see).
        const ed = String(b.edition ?? "");
        await createAdminClient().from("it_devices").update({ windows_edition: ed, edition_source: "reported", edition_checked_at: new Date().toISOString() }).eq("device_key", b.deviceKey);
        return NextResponse.json({ ok: true });
      }
      case "refresh_employee":
        return NextResponse.json(await refreshEmployeeDevices(b.employeeId));
      case "sync_editions":
        return NextResponse.json(await syncWindowsEditions());
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 400 });
  }
}
