import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { financeGate, isResponse } from "@/lib/finance/access";
import { getQboConfig, QBO_AUTHORIZE_URL, QBO_SCOPE } from "@/lib/finance/qbOnline";

export const dynamic = "force-dynamic";

// "Connect to QuickBooks" — sends finance to Intuit to approve access.
export async function GET(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const cfg = await getQboConfig();
  if (!cfg) return NextResponse.redirect(new URL("/admin/connectors?qbo=not-configured#quickbooks", req.nextUrl.origin));
  const state = randomBytes(24).toString("hex");
  const url = new URL(QBO_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: QBO_SCOPE,
    redirect_uri: `${req.nextUrl.origin}/api/admin/quickbooks/online/callback`,
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("qbo_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/quickbooks/online", maxAge: 600 });
  return res;
}
