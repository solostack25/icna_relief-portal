import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDeviceViewer, type DeviceViewer } from "@/lib/devices/access";

// Shared by the Phones (3CX + Skyetel) admin routes: IT-only access and an
// audit trail of every change made from the portal.

export async function requirePhonesViewer(): Promise<DeviceViewer | NextResponse> {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required." }, { status: 403 });
  return viewer;
}

export async function phoneAudit(e: {
  actor: DeviceViewer;
  system: "3cx" | "skyetel";
  action: string;
  target?: string | null;
  detail?: unknown;
  ok: boolean;
  error?: string | null;
}) {
  try {
    await createAdminClient().from("phone_admin_audit").insert({
      actor_id: e.actor.employeeId,
      actor_name: e.actor.name,
      system: e.system,
      action: e.action,
      target: e.target ?? null,
      detail: e.detail ?? null,
      ok: e.ok,
      error: e.error ?? null,
    });
  } catch (err) {
    console.error("[phones] audit insert failed", err);
  }
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}
