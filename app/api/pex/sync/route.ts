import { NextResponse } from "next/server";
import { readJson } from "@/lib/grantManagement/api";
import { requirePex } from "@/lib/pex/access";
import { linkUploadedToCards, runFullSync } from "@/lib/pex/sync";
import { createAdminClient } from "@/lib/grantManagement/server";

export const maxDuration = 300;

// "Sync now" (Finance / PEX admins).
export async function POST(req: Request) {
  const auth = await requirePex({ admin: true });
  if ("res" in auth) return auth.res;
  const body = await readJson(req);
  const days = Math.min(Math.max(Number(body.days) || 45, 1), 365);
  const r = await runFullSync("manual", auth.viewer.employeeId, days);
  if (r.ok) await linkUploadedToCards(createAdminClient());
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
