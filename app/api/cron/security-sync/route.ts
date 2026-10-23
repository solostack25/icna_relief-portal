import { NextRequest, NextResponse } from "next/server";
import { runSecuritySync } from "@/lib/security/sync";

export const maxDuration = 300;

// Nightly Defender / Secure Score / MFA / risky users sync (see vercel.json).
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runSecuritySync({ trigger: "cron" }));
}
