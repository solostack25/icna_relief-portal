import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionEmployee } from "@/lib/provisionEmployee";

// Handles the redirect back from Azure AD after SSO login, exchanges
// the auth code for a session, then provisions the employee record
// if this is their first time signing in.
//
// Provisioning runs in-process (not via a self-fetch to
// /api/auth/provision) because a server-to-server fetch from here
// would be a brand-new request that doesn't carry the session cookie
// we just set below — that was silently failing every first-login
// provisioning attempt with a 401.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      await provisionEmployee(data.user).catch(() => {
        // Provisioning failing shouldn't block sign-in — /select-app
        // shows "no employee record" if it didn't end up creating one,
        // which is the right fallback for a real mapping/Graph issue.
      });
      return NextResponse.redirect(`${origin}/select-app`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
