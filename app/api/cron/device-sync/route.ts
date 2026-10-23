import { NextRequest, NextResponse } from "next/server";
import { runDeviceSync } from "@/lib/devices/sync";

export const maxDuration = 300;

// Nightly Entra/Intune device + license sync (see vercel.json).
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDeviceSync({ trigger: "cron" });
  return NextResponse.json(result);
}
