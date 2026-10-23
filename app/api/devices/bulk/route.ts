import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { gBatch } from "@/lib/devices/graph";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Safety floor: bulk-disable only touches devices nobody has used for
// this long, whatever the page sent. Single devices can still be
// disabled any time from their own page.
const MIN_IDLE_DAYS = 60;

// POST { action: "disable" | "enable", keys: string[], reason }
export async function POST(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action === "enable" ? "enable" : body.action === "disable" ? "disable" : null;
  const keys: string[] = Array.isArray(body.keys) ? body.keys.filter((k: unknown) => typeof k === "string").slice(0, 1000) : [];
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!action) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!keys.length) return NextResponse.json({ error: "Pick at least one device." }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });

  const admin = createAdminClient();
  const devices: { device_key: string; entra_object_id: string | null; display_name: string | null; approx_last_sign_in: string | null; intune_last_sync: string | null; account_enabled: boolean | null }[] = [];
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await admin
      .from("it_devices")
      .select("device_key, entra_object_id, display_name, approx_last_sign_in, intune_last_sync, account_enabled")
      .in("device_key", keys.slice(i, i + 200));
    devices.push(...((data ?? []) as typeof devices));
  }

  const cutoff = Date.now() - MIN_IDLE_DAYS * 86_400_000;
  const skipped: { key: string; name: string | null; why: string }[] = [];
  const targets = devices.filter((d) => {
    if (!d.entra_object_id) return skipped.push({ key: d.device_key, name: d.display_name, why: "not in Entra" }), false;
    if (action === "disable") {
      const last = [d.approx_last_sign_in, d.intune_last_sync].filter(Boolean).sort().pop();
      if (last && new Date(last).getTime() > cutoff) return skipped.push({ key: d.device_key, name: d.display_name, why: `used in the last ${MIN_IDLE_DAYS} days` }), false;
      if (d.account_enabled === false) return skipped.push({ key: d.device_key, name: d.display_name, why: "already disabled" }), false;
    } else if (d.account_enabled !== false) {
      return skipped.push({ key: d.device_key, name: d.display_name, why: "already enabled" }), false;
    }
    return true;
  });

  let results = new Map<string, { status: number; error?: string }>();
  if (targets.length) {
    try {
      results = await gBatch(
        targets.map((d, i) => ({ id: String(i), method: "PATCH" as const, url: `/devices/${d.entra_object_id}`, body: { accountEnabled: action === "enable" } }))
      );
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Microsoft request failed" }, { status: 502 });
    }
  }

  const ok: string[] = [];
  const failed: { key: string; name: string | null; error: string }[] = [];
  targets.forEach((d, i) => {
    const r = results.get(String(i));
    if (r && r.status < 300) ok.push(d.device_key);
    else failed.push({ key: d.device_key, name: d.display_name, error: r?.error ?? "No response" });
  });

  for (let i = 0; i < ok.length; i += 200) {
    await admin.from("it_devices").update({ account_enabled: action === "enable" }).in("device_key", ok.slice(i, i + 200));
  }
  const byKey = new Map(targets.map((d) => [d.device_key, d]));
  const auditRows = [
    ...ok.map((k) => ({ device_key: k, device_name: byKey.get(k)?.display_name ?? null, action, actor_id: viewer.employeeId, reason, ok: true, detail: { bulk: true } })),
    ...failed.map((f) => ({ device_key: f.key, device_name: f.name, action, actor_id: viewer.employeeId, reason, ok: false, detail: { bulk: true, error: f.error } })),
  ];
  for (let i = 0; i < auditRows.length; i += 500) await admin.from("it_device_audit").insert(auditRows.slice(i, i + 500));

  return NextResponse.json({ done: ok.length, failed, skipped });
}
