import { NextResponse } from "next/server";
import { getInkindAccess } from "@/lib/inkind/access";

// Resends the donor receipt email — reuses the InKind kiosk's own
// /api/inkind/send-donor-email endpoint (same PDF-building + settings-driven
// template logic) rather than duplicating Resend/PDF code here. Now that
// the kiosk lives in this same app (was a separate deployment, pointed at
// by INTAKE_APP_URL), this calls it directly via NEXT_PUBLIC_SITE_URL
// instead of an external URL.
//
// Wrapped in a top-level try/catch so this ALWAYS returns valid JSON
// with a useful message, even if something upstream throws — an empty
// or non-JSON response here just shows up on the frontend as a cryptic
// "Unexpected end of JSON input," which isn't actionable.
export async function POST(req: Request) {
  try {
    const access = await getInkindAccess();
    if (!access.ok) {
      return NextResponse.json({ error: "Not authorized" }, { status: access.status });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SITE_URL is not set in this app's environment variables" },
        { status: 500 }
      );
    }

    const targetUrl = `${siteUrl.replace(/\/$/, "")}/api/inkind/send-donor-email`;
    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch (fetchErr: any) {
      return NextResponse.json(
        { error: `Couldn't reach the intake app at ${targetUrl}: ${fetchErr.message ?? "network error"}` },
        { status: 502 }
      );
    }

    const rawBody = await res.text();
    let result: any;
    try {
      result = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          error: `Intake app returned a non-JSON response (HTTP ${res.status}): ${rawBody.slice(0, 200) || "(empty body)"}`,
        },
        { status: 502 }
      );
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    if (result.skipped) {
      return NextResponse.json({ error: result.reason ?? "Email was skipped" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unexpected server error" }, { status: 500 });
  }
}
