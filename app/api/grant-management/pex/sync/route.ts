import { NextResponse } from "next/server";
import { requireViewer, readJson } from "@/lib/grantManagement/api";
import { linkUploadedToCards, runFullSync } from "@/lib/pex/sync";
import { createAdminClient } from "@/lib/grantManagement/server";

export const maxDuration = 300;

// "Sync now" on the PEX dashboard (Grant Management only).
export async function POST(req: Request) {
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const body = await readJson(req);
  const days = Math.min(Math.max(Number(body.days) || 45, 1), 365);
  const r = await runFullSync("manual", auth.viewer.employeeId, days);
  if (r.ok) await linkUploadedToCards(createAdminClient());
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
