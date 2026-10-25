import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { INDICATOR_TYPES, checkIndicator, type IndicatorType } from "@/lib/security/indicators";
import { logSecurityAction } from "@/lib/security/log";
import { explainMdeError, mdeDelete, mdePost } from "@/lib/security/mde";

// POST { action: "add", type, value, reason, days? }  → block across every onboarded PC
// POST { action: "remove", id, value, reason }        → lift a block
// Defender custom indicators (Ti.ReadWrite.All on the WindowsDefenderATP API).
export async function POST(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (reason.length < 5) return NextResponse.json({ error: "Add a short reason (e.g. incident # or where you saw it)." }, { status: 400 });

  if (body.action === "remove") {
    const id = String(body.id ?? "");
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Bad indicator id" }, { status: 400 });
    let error: string | null = null;
    try {
      await mdeDelete(`/indicators/${id}`);
    } catch (e) {
      error = explainMdeError(e, "Ti.ReadWrite.All");
    }
    await logSecurityAction({ targetType: "indicator", targetId: id, targetName: String(body.value ?? "").slice(0, 300) || null, action: "indicator_remove", actorId: viewer.employeeId, reason, ok: !error, detail: error ? { error } : null });
    if (error) return NextResponse.json({ error }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "add") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const checked = checkIndicator(String(body.type ?? ""), String(body.value ?? ""));
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });
  const type = body.type as IndicatorType;
  const days = Number(body.days) || 0;
  const payload: Record<string, unknown> = {
    indicatorValue: checked.value,
    indicatorType: type,
    action: INDICATOR_TYPES[type].action,
    title: `ICNA portal block: ${checked.value}`.slice(0, 250),
    description: `${reason} (blocked by ${viewer.name} from the ICNA portal)`.slice(0, 1000),
    severity: "High",
    generateAlert: true,
    recommendedActions: "Check the device and the user's mailbox; contact ICNA IT.",
  };
  if (days > 0) payload.expirationTime = new Date(Date.now() + Math.min(days, 365) * 86_400_000).toISOString();

  let error: string | null = null;
  let id: string | null = null;
  try {
    const res = await mdePost("/indicators", payload);
    id = res?.id != null ? String(res.id) : null;
  } catch (e) {
    error = explainMdeError(e, "Ti.ReadWrite.All");
  }
  await logSecurityAction({
    targetType: "indicator",
    targetId: id ?? String(checked.value),
    targetName: String(checked.value),
    action: "indicator_add",
    actorId: viewer.employeeId,
    reason,
    ok: !error,
    detail: { type, days: days || null, ...(error ? { error } : {}) },
  });
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ ok: true, id });
}
