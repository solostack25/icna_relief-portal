import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionEmployee } from "@/lib/provisionEmployee";

// Thin wrapper for manually re-triggering provisioning from an
// already-authenticated browser session (e.g. from the admin UI,
// after fixing an AD mapping). The callback route no longer calls
// this over the network — see app/auth/callback/route.ts — because a
// server-to-server fetch doesn't carry the session cookie that was
// just set on the outgoing response.
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No authenticated user" }, { status: 401 });
  }

  const result = await provisionEmployee(user);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
