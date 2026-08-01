import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the redirect back from Azure AD after SSO login, exchanges
// the auth code for a session, then provisions the employee record
// if this is their first time signing in (see /api/auth/provision).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // trigger provisioning check (no-op if the employee already exists)
      await fetch(`${origin}/api/auth/provision`, { method: "POST" }).catch(() => {});
      return NextResponse.redirect(`${origin}/select-app`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
