import { NextResponse } from "next/server";
import { runSpeakerRequestReminders } from "@/lib/speakerRequests";

export const maxDuration = 300;

// Daily (see vercel.json): nudges approvers sitting on a request for
// 48h+, and speakers who haven't signed / sent their W-9 after 3 days.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSpeakerRequestReminders();
  return NextResponse.json({ ok: true, ...result });
}
